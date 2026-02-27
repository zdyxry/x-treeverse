import { HierarchyPointNode } from 'd3-hierarchy'
import { FeedController } from './feed_controller'
import { TweetVisualization } from './tweet_visualization'
import { TweetNode, TweetTree } from './tweet_tree'
import { TweetServer } from './tweet_server'
import { Toolbar } from './toolbar'
import { ContentProxy } from './proxy'

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
  }

  private expandNode(node: TweetNode, retry: boolean = true) {
    const cursor = node.cursor
    console.log(`[Treeverse] expandNode called, tweetId: ${node.tweet.id}, cursor: ${cursor}, retry: ${retry}`)
    this.server!
      .requestTweets(node.tweet.id, cursor)
      .then((tweetSet) => {
        console.log(`[Treeverse] expandNode response received, tweets: ${tweetSet.tweets.length}`)
        let added = this.tweetTree!.addTweets(tweetSet, node.tweet.id)
        console.log(`[Treeverse] expandNode added ${added} tweets, node ${node.tweet.id} hasMore=${node.hasMore()}`)
        if (added > 0 || !node.hasMore()) {
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

  constructor(proxy: ContentProxy | null = null) {
    const offline = proxy === null
    this.server = offline ? null : new TweetServer(proxy)
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
        // Remove the has_more icon immediately on double-click
        this.vis.removeHasMoreIcon(node.tweet.id)
        this.expandNode(node, true)
      })
    }
  }
}
