import { select, Selection } from 'd3-selection'
import { interpolateNumber } from 'd3-interpolate'
// Import d3-transition to enable transition method on selections
import 'd3-transition'
import { PointNode } from './visualization_controller'
import { TweetNode } from './tweet_tree'
import { HierarchyPointNode } from 'd3-hierarchy'

function showLightbox(imageUrl: string) {
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;cursor:pointer;'
  const img = document.createElement('img')
  img.src = imageUrl
  img.style.cssText = 'max-width:90vw;max-height:90vh;object-fit:contain;border-radius:8px;'
  overlay.appendChild(img)
  overlay.addEventListener('click', () => overlay.remove())
  document.body.appendChild(overlay)
}

/**
 * Controller for the "feed" display that shows the conversation
 * leading up to the selected tweet.
 */
export class FeedController {
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  async exitComments(comments: Selection<Element, unknown, null, undefined>): Promise<void> {
    return new Promise<void>((resolve) => {
      if (comments.exit().size() == 0) {
        resolve()
        return
      }
      comments
        .exit()
        .transition().duration(100)
        .on('end', () => resolve())
        .style('opacity', 0)
        .remove()
    })
  }

  async enterComments(comments: Selection<Element, unknown, null, undefined>): Promise<void> {
    console.log('[Treeverse] enterComments called, enter size:', comments.enter().size())
    return new Promise<void>((resolve) => {
      if (comments.enter().size() == 0) {
        resolve()
        return
      }
      console.log('[Treeverse] creating comment elements...')
      comments
        .enter()
        .append('div')
        .classed('card card-compact bg-base-100 shadow-sm tweet-item', true)
        .each(function (this: Element, datum: unknown) {
          const d = datum as PointNode
          let tweet = d.data.tweet
          let card = select(this)

          let cardBody = card.append('div').classed('card-body p-3', true)

          // Header with avatar and author info
          let header = cardBody.append('div').classed('flex items-start gap-3', true)

          let avatarLink = header.append('a')
            .attr('href', tweet.getUserUrl())
            .attr('target', '_blank')
            .classed('flex-shrink-0', true)
          
          avatarLink.append('img')
            .attr('src', tweet.avatar)
            .classed('w-10 h-10 rounded-lg object-cover', true)

          let content = header.append('div').classed('flex-grow min-w-0', true)

          let authorRow = content.append('div').classed('flex items-center gap-2 flex-wrap', true)
          
          authorRow.append('span')
            .classed('font-semibold text-base-content text-sm', true)
            .text(tweet.name)
          
          authorRow.append('a')
            .attr('href', tweet.getUserUrl())
            .attr('target', '_blank')
            .classed('text-xs text-base-content/50 hover:text-primary transition-colors', true)
            .text(`@${tweet.username}`)
          
          // Absolute timestamp
          let date = new Date(tweet.time)
          let timeStr = date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          })
          authorRow.append('span')
            .classed('text-xs text-base-content/40 ml-auto', true)
            .text(timeStr)

          let body = content.append('div')
            .classed('text-sm text-base-content/80 mt-1 leading-relaxed', true)
            .classed('rtl', tweet.rtl)
            .html(tweet.bodyHtml)

          // Link to tweet
          body.append('a')
            .attr('href', tweet.getUrl())
            .attr('target', '_blank')
            .classed('text-primary hover:text-primary-focus ml-1', true)
            .html('→')

          // Images
          if (tweet.images && tweet.images.length > 0) {
            const gridClass = tweet.images.length === 1
              ? 'mt-2'
              : 'grid grid-cols-2 gap-2 mt-2'
            let imagesContainer = content.append('div')
              .classed(gridClass, true)
            
            for (const imgUrl of tweet.images) {
              imagesContainer.append('img')
                .attr('src', imgUrl)
                .classed('w-full rounded-lg', true)
                .style('max-height', '300px')
                .style('object-fit', 'cover')
                .style('cursor', 'pointer')
                .on('click', function () {
                  showLightbox(imgUrl)
                })
            }
          }

          // Videos
          if (tweet.videos && tweet.videos.length > 0) {
            for (const video of tweet.videos) {
              content.append('video')
                .attr('src', video.videoUrl)
                .attr('poster', video.thumbnailUrl)
                .attr('controls', '')
                .attr('preload', 'metadata')
                .classed('w-full rounded-lg mt-2', true)
                .style('max-height', '300px')
            }
          }
        })
        .style('opacity', 0)
        .transition().duration(150)
        .style('opacity', 1)
        .on('start', () => resolve())
    })
  }

  async setFeed(node: PointNode) {
    console.log('[Treeverse] setFeed called, ancestors count:', node.ancestors().length)
    let ancestors = node.ancestors()
    ancestors.reverse()
    
    const feedContainer = this.container.querySelector('#feed')
    console.log('[Treeverse] feed container:', feedContainer)
    
    let comments = select(feedContainer)
      .selectAll('div.tweet-item')
      .data(ancestors, (d: unknown) => (d as HierarchyPointNode<TweetNode>).data.getId())
    
    console.log('[Treeverse] comments selection size:', comments.size(), 'enter size:', comments.enter().size(), 'exit size:', comments.exit().size())

    await this.exitComments(comments as unknown as Selection<Element, unknown, null, undefined>)
    await this.enterComments(comments as unknown as Selection<Element, unknown, null, undefined>)

    // D3 v7: Use selection.transition() instead of d3.transition(null)
    select(this.container).transition().tween('scroll',
      () => {
        let interp = interpolateNumber(this.container.scrollTop, this.container.scrollHeight)
        return (t: number) => this.container.scrollTop = interp(t)
      }
    )
  }
}
