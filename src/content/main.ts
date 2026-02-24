function init() {
    // Twitter web client bearer token (public, used by all cookie-based clients)
    const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

    function getCt0(): string | null {
        const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/)
        return match ? match[1] : null
    }

    function getAuthHeaders(): Record<string, string> {
        const ct0 = getCt0()
        const headers: Record<string, string> = {
            'authorization': 'Bearer ' + BEARER_TOKEN,
            'x-twitter-active-user': 'yes',
            'x-twitter-auth-type': 'OAuth2Session',
        }
        if (ct0) {
            headers['x-csrf-token'] = ct0
        }
        // Fallback to XHR-captured auth
        if (!ct0 && xhrAuth['x-csrf-token']) {
            headers['x-csrf-token'] = xhrAuth['x-csrf-token']
            headers['authorization'] = xhrAuth['authorization']
        }
        return headers
    }

    // Capture GraphQL TweetDetail info from Performance API (already-made requests)
    let capturedGraphQLInfo: { queryId: string, features: string } | null = null

    function captureFromPerformance(): { queryId: string, features: string } | null {
        try {
            const entries = performance.getEntriesByType('resource')
            for (const entry of entries) {
                const match = entry.name.match(/\/i\/api\/graphql\/([^/]+)\/TweetDetail/)
                if (match) {
                    const queryId = match[1]
                    const url = new URL(entry.name)
                    const features = url.searchParams.get('features')
                    return { queryId, features }
                }
            }
        } catch (e) { }
        return null
    }

    capturedGraphQLInfo = captureFromPerformance()

    // Hook fetch to capture future GraphQL TweetDetail requests
    const originalFetch = window.fetch
    window.fetch = function (...args: any[]) {
        try {
            const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || ''
            const tweetDetailMatch = url.match(/\/i\/api\/graphql\/([^/]+)\/TweetDetail/)
            if (tweetDetailMatch) {
                try {
                    const queryId = tweetDetailMatch[1]
                    const urlObj = new URL(url, location.origin)
                    const features = urlObj.searchParams.get('features')
                    capturedGraphQLInfo = { queryId, features }
                    window.postMessage({
                        action: 'graphql_info',
                        graphqlInfo: capturedGraphQLInfo
                    }, '*')
                } catch (e) { }
            }
        } catch (e) { }
        return originalFetch.apply(this, args)
    }

    // Keep XHR hook as backup for auth capture
    const oldSetRequestHeader = window.XMLHttpRequest.prototype.setRequestHeader
    let xhrAuth: Record<string, string> = {}

    window.XMLHttpRequest.prototype.setRequestHeader = function (h, v) {
        if (h === 'x-csrf-token' || h === 'authorization') {
            xhrAuth[h] = v
        }
        oldSetRequestHeader.apply(this, [h, v])
    }

    // Handle messages from Treeverse viewer
    window.addEventListener("message", (message) => {
        if (message.data.action === 'fetch') {
            const headers = getAuthHeaders()
            originalFetch(message.data.url, {
                credentials: 'include',
                headers
            }).then((x) => x.json()).then((x) => {
                window.postMessage({
                    action: 'result',
                    key: message.data.key,
                    result: x
                }, '*')
            }).catch((e) => {
                window.postMessage({
                    action: 'result',
                    key: message.data.key,
                    result: { errors: [{ message: e.message }] }
                }, '*')
            })
        } else if (message.data.action === 'get_graphql_info') {
            // Re-check Performance API in case new requests were made
            if (!capturedGraphQLInfo) {
                capturedGraphQLInfo = captureFromPerformance()
            }
            window.postMessage({
                action: 'graphql_info',
                graphqlInfo: capturedGraphQLInfo
            }, '*')
        }
    }, false)

    // Send captured GraphQL info if available
    if (capturedGraphQLInfo) {
        window.postMessage({
            action: 'graphql_info',
            graphqlInfo: capturedGraphQLInfo
        }, '*')
    }

    // Signal ready based on cookie availability
    const ct0 = getCt0()
    if (ct0) {
        window.postMessage({
            action: 'state',
            state: 'ready',
        }, '*')
    } else {
        window.postMessage({
            action: 'state',
            state: 'listening',
        }, '*')
    }
}

init()
