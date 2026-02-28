import { RateLimitError, RateLimitInfo } from './rate_limiter'

enum Action {
  state = 'state',
  result = 'result',
  fetch = 'fetch',
  graphql_info = 'graphql_info',
  get_graphql_info = 'get_graphql_info'
}

enum State {
  ready = 'ready',
  listening = 'listening',
  waiting = 'waiting'
}

interface FetchRequest {
  url: string,
  key: string,
  action: 'fetch'
}

interface FetchResponse {
  result: any,
  key: string,
  status: number,
  rateLimitInfo: RateLimitInfo | null,
  action: Action.result
}

interface StateResponse {
  action: Action.state,
  state: State
}

export interface GraphQLInfo {
  queryId: string
  features: string
}

export class ContentProxy {
  callbacks: Map<string, (response: FetchResponse) => void> = new Map()
  state: State = State.waiting
  graphqlInfo: GraphQLInfo | null = null

  getGraphQLInfo(): GraphQLInfo | null {
    return this.graphqlInfo
  }

  async delegatedFetch(url: string): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      this.callbacks.set(url, (resp: FetchResponse) => {
        if (resp.status === 429) {
          const resetTime = resp.rateLimitInfo?.reset
            ? parseInt(resp.rateLimitInfo.reset, 10)
            : Math.floor(Date.now() / 1000) + 900 // fallback: 15 min
          reject(new RateLimitError(resetTime))
        } else {
          resolve(resp.result)
        }
      })
      const request: FetchRequest = {
        action: Action.fetch,
        key: url,
        url: url
      }
      window.postMessage(request, '*')
    })
  }

  requestGraphQLInfo() {
    window.postMessage({ action: Action.get_graphql_info }, '*')
  }

  async inject() {
    let scr = document.createElement('script')
    scr.setAttribute('src', chrome.runtime.getURL("resources/script/content.js"))
  
    window.addEventListener("message", (message) => {
      switch (message.data.action) {
        case Action.state:
          const actionData = message.data as StateResponse
          this.state = actionData.state

          if (this.state === 'ready') {
            chrome.runtime.sendMessage({message: 'ready'});
            // Request GraphQL info once ready
            this.requestGraphQLInfo()
          }

          break
        case Action.result:
          const resultData = message.data as FetchResponse
          const callback = this.callbacks.get(resultData.key)
          if (callback) {
            callback(resultData)
          }
          break
        case Action.graphql_info:
          if (message.data.graphqlInfo) {
            this.graphqlInfo = message.data.graphqlInfo as GraphQLInfo
          }
          break
      }
    }, false)
    document.body.appendChild(scr)
  }
}
