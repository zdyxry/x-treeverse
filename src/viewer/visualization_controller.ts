import { HierarchyPointNode } from 'd3-hierarchy'
import { FeedController } from './feed_controller'
import { TweetVisualization } from './tweet_visualization'
import { TweetNode, TweetTree } from './tweet_tree'
import { TweetServer } from './tweet_server'
import { Toolbar } from './toolbar'
import { ContentProxy } from './proxy'
import { RateLimiter } from './rate_limiter'

export type PointNode = HierarchyPointNode<TweetNode>

/**
 * The controller for the main tree visualization.
 */
export class VisualizationController {
  private tweetTree: TweetTree | null = null
  private vis: TweetVisualization
  private feed: FeedController
  private toolbar: Toolbar
  private server: TweetServer | null = null
  private rateLimitBanner: HTMLElement | null = null

  fetchTweets(tweetId: string) {
    console.log('[Treeverse] fetchTweets called')
    this.server!.requestTweets(tweetId, null).then((tweetSet) => {
      console.log('[Treeverse] tweetSet received, tweets count:', tweetSet.tweets.length)
      let tweetTree = TweetTree.fromTweetSet(tweetSet)
      document.getElementsByTagName('title')[0].innerText =
        `${tweetTree.root.tweet.username} - "${tweetTree.root.tweet.bodyText}" in Treeverse`

      this.setInitialTweetData(tweetTree)
    })
  }

  setInitialTweetData(tree: TweetTree) {
    this.tweetTree = tree
    this.vis.setTreeData(tree)
    this.vis.zoomToFit()

    // Show root tweet in sidebar by default
    let rootNode = tree.toHierarchy() as unknown as PointNode
    this.feed.setFeed(rootNode)
  }

  private expandNode(node: TweetNode, retry: boolean = true) {
    const cursor = node.cursor
    console.log(`[Treeverse] expandNode called, tweetId: ${node.tweet.id}, cursor: ${cursor}, retry: ${retry}`)
    this.server!
      .requestTweets(node.tweet.id, cursor)
      .then((tweetSet) => {
        console.log(`[Treeverse] expandNode response received, tweets: ${tweetSet.tweets.length}`)
        let added = this.tweetTree!.addTweets(tweetSet, node.tweet.id)
        console.log(`[Treeverse] expandNode added ${added} tweets, node ${node.tweet.id} canLoadMorePages=${node.canLoadMorePages()}`)
        if (added > 0 || !node.canLoadMorePages()) {
          this.vis.setTreeData(this.tweetTree!)
          if (node === this.tweetTree!.root) {
            this.vis.zoomToFit()
          }
        } else if (retry) {
          this.expandNode(node, false)
        }
      })
      .catch((err) => {
        console.error('[Treeverse] expandNode error:', err)
      })
  }

  async copyAsMermaid() {
    if (!this.tweetTree) {
      console.error('[Treeverse] No tweet tree to copy')
      return
    }
    
    const markdown = this.tweetTree.toMermaidMarkdown()
    
    try {
      await navigator.clipboard.writeText(markdown)
      console.log('[Treeverse] Copied to clipboard')
      // Show a simple notification
      const notification = document.createElement('div')
      notification.textContent = 'Copied as Mermaid!'
      notification.className = 'fixed top-4 right-4 bg-success text-success-content px-4 py-2 rounded shadow-lg z-50'
      document.body.appendChild(notification)
      setTimeout(() => notification.remove(), 2000)
    } catch (err) {
      console.error('[Treeverse] Failed to copy:', err)
    }
  }

  private showRateLimitBanner(resetTimestamp: number) {
    if (this.rateLimitBanner) return
    const banner = document.createElement('div')
    banner.className = 'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-2 px-4 bg-warning text-warning-content text-sm font-medium shadow-md'
    banner.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
      </svg>
      <span>Rate limited by Twitter/X. Requests paused, resuming in <strong id="rateLimitCountdown">--</strong>s</span>
    `
    document.body.appendChild(banner)
    this.rateLimitBanner = banner
  }

  private hideRateLimitBanner() {
    if (this.rateLimitBanner) {
      this.rateLimitBanner.remove()
      this.rateLimitBanner = null
    }
  }

  private updateCountdown(secondsRemaining: number) {
    const el = document.getElementById('rateLimitCountdown')
    if (el) {
      el.textContent = String(secondsRemaining)
    }
  }

  constructor(proxy: ContentProxy | null = null) {
    const offline = proxy === null
    let rateLimiter: RateLimiter | null = null
    if (!offline) {
      rateLimiter = new RateLimiter()
      rateLimiter.on('rateLimited', (resetTimestamp: number) => {
        this.showRateLimitBanner(resetTimestamp)
      })
      rateLimiter.on('countdown', (seconds: number) => {
        this.updateCountdown(seconds)
      })
      rateLimiter.on('rateLimitCleared', () => {
        this.hideRateLimitBanner()
      })
    }
    this.server = offline ? null : new TweetServer(proxy!, rateLimiter!)
    this.feed = new FeedController(document.getElementById('feedContainer')!)
    this.vis = new TweetVisualization(document.getElementById('tree')!)

    this.toolbar = new Toolbar(document.getElementById('toolbar')!)
    if (!offline) {
      this.toolbar.addButton('Copy as Mermaid', this.copyAsMermaid.bind(this))
    }

    this.vis.on('hover', (event: Event, d: unknown) => {
      console.log('[Treeverse] hover event triggered, event:', event, 'd:', d)
      // d3-dispatch v7: when using .call(type, that, ...args), the first argument to callback
      // is the event object (which contains the data we passed), not the first arg from .call()
      // The actual data passed to .call() is in event, not in d
      const node = (event as any) as PointNode
      if (!node || !node.data) {
        console.error('[Treeverse] hover node or node.data is undefined!')
        return
      }
      console.log('[Treeverse] hover node:', node.data.tweet.username, node.data.tweet.bodyText.substring(0, 50))
      this.feed.setFeed(node)
    })
    if (!offline) {
      this.vis.on('dblclick', (_event: Event, d: unknown) => {
        // d3-dispatch v7: first argument is the data passed to .call()
        // For dblclick, we pass datum.data (TweetNode) directly
        console.log('[Treeverse] dblclick event received, d:', d)
        const node = (d || _event) as TweetNode
        if (!node || !node.tweet) {
          console.error('[Treeverse] dblclick: invalid node', node)
          return
        }
        // Mark node as expanded immediately so redraw won't re-add the icon
        node.complete = true
        this.vis.removeHasMoreIcon(node.tweet.id)
        this.expandNode(node, true)
      })
    }
  }
}
