import { select, Selection } from 'd3-selection'
import { tree, HierarchyNode, HierarchyPointNode } from 'd3-hierarchy'
import { zoom, zoomIdentity, ZoomBehavior } from 'd3-zoom'
import { scaleSqrt, ScalePower } from 'd3-scale'
import { dispatch, Dispatch } from 'd3-dispatch'
// Import d3-transition to enable transition method on selections
import 'd3-transition'
import { PointNode } from './visualization_controller'
import { TweetNode, TweetTree } from './tweet_tree'

type D3Selection = Selection<SVGGElement, unknown, null, undefined>

/**
 * Renders the main tree visualization.
 */
export class TweetVisualization {
  private container!: Selection<HTMLElement, unknown, null, undefined>
  private treeGroup!: Selection<SVGGElement, unknown, null, undefined>
  private nodes!: Selection<SVGGElement, unknown, null, undefined>
  private edges!: Selection<SVGGElement, unknown, null, undefined>
  private zoomBehavior!: ZoomBehavior<Element, unknown>
  private listeners!: Dispatch<EventTarget>
  private colorScale!: ScalePower<string, number, never>
  private selected: HierarchyPointNode<TweetNode> | null = null
  private xscale: number = 0
  private yscale: number = 0
  private layout: HierarchyPointNode<TweetNode> | null = null

  constructor(svgElement: HTMLElement) {
    this.buildTree(svgElement)
    this.listeners = dispatch('hover', 'click', 'dblclick')

    let timeIntervals = [
      300,
      600,
      3600,
      10800
    ]
    let timeColors = [
      '#FA5050',
      '#E9FA50',
      '#F5F1D3',
      '#47D8F5'
    ]

    this.colorScale = scaleSqrt<string, number>()
      .domain(timeIntervals)
      .range(timeColors)
  }

  on(eventType: string, callback: (event: Event, d: unknown) => void) {
    this.listeners.on(eventType, callback)
  }

  private colorEdge(edgeTarget: HierarchyNode<TweetNode>): string {
    let data = edgeTarget.data
    let timeDelta = (data.tweet.time - (edgeTarget.parent!.data as TweetNode).tweet.time) / 1000
    return this.colorScale(timeDelta).toString()
  }

  private static treeWidth<T>(hierarchyNode: HierarchyNode<T>): number {
    let widths = new Map<number, number>()
    hierarchyNode.each((node) => {
      widths.set(node.depth, (widths.get(node.depth) || 0) + 1)
    })

    return Math.max(...Array.from(widths.values()))
  }

  private buildTree(container: HTMLElement) {
    // Clear any existing content
    select(container).selectAll('*').remove()
    
    this.container = select(container)
    this.treeGroup = this.container.append('g')

    this.edges = this.treeGroup.append('g')
    this.nodes = this.treeGroup.append('g')

    // D3 v7: event is passed as parameter instead of using d3.event
    this.container.on('click', () => { 
      this.selected = null
      this.redraw() 
    })

    // Set up zoom functionality.
    this.zoomBehavior = zoom<Element, unknown>()
      .scaleExtent([0, 2])
      .on('zoom', (event) => {
        let x = event.transform.x
        let y = event.transform.y
        let scale = event.transform.k

        this.treeGroup.attr('transform', `translate(${x} ${y}) scale(${scale})`)
      })
    this.container.call(this.zoomBehavior as any)

    // D3 v7: event is passed as parameter
    select('body').on('keydown', (event: KeyboardEvent) => {
      if (!this.selected) {
        return
      }
      switch (event.code) {
        case 'ArrowDown':
          if (this.selected.children && this.selected.children.length > 0) {
            this.selected = this.selected.children[0] as HierarchyPointNode<TweetNode>
          }
          break
        case 'ArrowUp':
          if (this.selected.parent) {
            this.selected = this.selected.parent as HierarchyPointNode<TweetNode>
          }
          break
        case 'ArrowLeft':
          if (this.selected.parent) {
            let i = this.selected.parent.children!.indexOf(this.selected)
            if (i > 0) {
              this.selected = this.selected.parent.children![i - 1] as HierarchyPointNode<TweetNode>
            }
          }
          break
        case 'ArrowRight':
          if (this.selected.parent) {
            let i = this.selected.parent.children!.indexOf(this.selected)
            if (i >= 0 && i < this.selected.parent.children!.length - 1) {
              this.selected = this.selected.parent.children![i + 1] as HierarchyPointNode<TweetNode>
            }
          }
          break
        case 'Space':
          this.listeners.call('dblclick', undefined, this.selected.data)
          break
        default:
          return
      }
      this.redraw()
      this.listeners.call('hover', undefined, this.selected)
    })
  }

  zoomToFit() {
    let clientRect = (this.container.node() as Element).getBoundingClientRect()
    let zoomLevel = Math.min(clientRect.height / this.yscale, clientRect.width / this.xscale, 1)

    this.container.transition().call(
      this.zoomBehavior.transform as any,
      zoomIdentity.translate(
        Math.max(0, (clientRect.width - this.xscale * zoomLevel) / 2),
        Math.max(20, (clientRect.height - this.yscale * zoomLevel) / 2)
      ).scale(zoomLevel)
    )
  }

  setTreeData(tree: TweetTree) {
    console.log('[Treeverse] setTreeData called')
    let hierarchyNode = tree.toHierarchy()
    let layout = treeFn<TweetNode>().separation((a, b) => a.children || b.children ? 3 : 2)(hierarchyNode)
    this.layout = layout

    let maxWidth = TweetVisualization.treeWidth(hierarchyNode)

    this.xscale = maxWidth * 120
    this.yscale = hierarchyNode.height * 120

    this.redraw()
  }

  redraw() {
    if (!this.layout) {
      return
    }

    let edgeToPath = (d: HierarchyPointNode<TweetNode>) => {
      let startX = this.xscale * d.parent!.x
      let startY = this.yscale * d.parent!.y
      let endY = this.yscale * d.y
      let endX = this.xscale * d.x
      return `M${startX},${startY} C${startX},${startY} ${endX},${endY} ${endX},${endY}`
    }

    let duration = 200

    let paths = this.edges
      .selectAll('path')
      .data(this.layout.descendants().slice(1), (d: unknown) => (d as HierarchyPointNode<TweetNode>).data.getId())

    paths.exit().remove()
    paths.attr('opacity', 1).transition().duration(duration).attr('d', edgeToPath as any)

    paths
      .enter()
      .append('path')
      .attr('d', edgeToPath as any)
      .attr('fill', 'none')
      .attr('stroke-width', 2)
      .attr('stroke', (d: unknown) => this.colorEdge(d as HierarchyNode<TweetNode>))
      .attr('opacity', 0)
      .transition().delay(duration)
      .attr('opacity', 1)

    let descendents = this.layout.descendants()

    if (this.selected) {
      // If a node is selected, find the node in the new tree with the same ID and select it.
      this.selected = descendents.find((d) => d.data.getId() == this.selected!.data.getId()) || null
    }

    let nodes = this.nodes.selectAll('g')
      .data(descendents, (d: unknown) => (d as HierarchyPointNode<TweetNode>).data.getId())

    nodes.exit().remove()

    nodes.transition()
      .duration(duration)
      .attr('transform', (d: unknown) => `translate(${(this.xscale * (d as HierarchyPointNode<TweetNode>).x) - 20} ${(this.yscale * (d as HierarchyPointNode<TweetNode>).y) - 20})`)

    nodes.each(function(this: any, datum: unknown) {
      let data = (datum as HierarchyPointNode<TweetNode>).data
      let group = select(this)
      if (!data.hasMore()) {
        group.select('.has_more_icon').remove()
      } else {
        // Add has_more icon if it doesn't exist
        if (group.select('.has_more_icon').empty()) {
          group.append('use')
            .classed('has_more_icon', true)
            .attr('href', '#has_more')
            .attr('transform', 'scale(0.5) translate(55 55)')
        }
      }
    })

    nodes
      .classed('selected', (d: unknown) => d === this.selected)
      .attr('opacity', 1)

    console.log('[Treeverse] creating nodes, count:', descendents.length)
    
    const enterNodes = nodes.enter()
      .append('g')
      .style('cursor', 'pointer')
      
    console.log('[Treeverse] enter nodes count:', enterNodes.size())
    
    const self = this
    
    enterNodes
      // D3 v7: event is passed as first parameter
      .on('mouseover', function(this: any, event: MouseEvent, d: unknown) {
        console.log('[Treeverse] mouseover raw d:', d)
        console.log('[Treeverse] mouseover this.datum:', select(this).datum())
        const datum = (d || select(this).datum()) as PointNode
        console.log('[Treeverse] mouseover event, datum:', datum, 'selected:', self.selected)
        if (!datum) {
          console.error('[Treeverse] mouseover datum is undefined!')
          return
        }
        if (!self.selected) {
          console.log('[Treeverse] calling hover listener with datum:', datum)
          self.listeners.call('hover', undefined, datum)
        }
      })
      .on('click', function(event: MouseEvent, d: unknown) {
        const datum = d as PointNode
        if (!datum) return
        self.listeners.call('hover', undefined, datum)
        self.selected = datum as unknown as HierarchyPointNode<TweetNode>
        self.redraw()
        event.stopPropagation()
      })
      .on('dblclick', function(event: MouseEvent, d: unknown) {
        const datum = d as PointNode
        if (!datum) return
        console.log('[Treeverse] calling dblclick listener')
        self.listeners.call('dblclick', undefined, datum.data)
        event.stopPropagation()
        self.selected = null
      })
      .classed('has_more', (d: unknown) => (d as HierarchyPointNode<TweetNode>).data.hasMore())
      .attr('transform', (d: unknown) => `translate(${(this.xscale * (d as HierarchyPointNode<TweetNode>).x) - 20} ${(this.yscale * (d as HierarchyPointNode<TweetNode>).y) - 20})`)
      .each(function (this: any, datum: unknown) {
        const d = datum as PointNode
        let group = select(this)
        let tweet = d.data.tweet

        group.append('rect')
          .attr('height', 40)
          .attr('width', 40)
          .attr('fill', 'white')

        group.append('image')
          .attr('href', tweet.avatar)
          .attr('height', 40)
          .attr('width', 40)

        group.append('rect')
          .attr('x', -1)
          .attr('y', -1)
          .attr('height', 42)
          .attr('width', 42)
          .attr('stroke', '#ddd')
          .attr('stroke-width', '3px')
          .attr('rx', '4px')
          .attr('fill', 'none')

        group.call((selection) => {
          let data = (selection.datum() as unknown as PointNode).data
          if (data.hasMore()) {
            selection.append('use')
              .classed('has_more_icon', true)
              .attr('href', '#has_more')
              .attr('transform', 'scale(0.5) translate(55 55)')
          }
        })
      })
      .attr('opacity', 0)
      .transition().delay(duration)
      .attr('opacity', 1)
  }
}

// Helper function for tree layout
function treeFn<T>() {
  return tree<T>()
}
