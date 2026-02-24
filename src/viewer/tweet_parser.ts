import { APIResponse } from './api'

/**
 * Contains information about an individual tweet.
 */
export class Tweet {
    /** Unique identifier of the tweet. */
    id: string;
    /** Handle of user who posted tweet. */
    username: string;
    /** Screen name of user who posted tweet. */
    name: string;
    /** HTML body of the tweet content. */
    bodyHtml: string;
    bodyText: string;
    /** URL of the avatar image for the user who posted the tweet.  */
    avatar: string;
    /** Time of the tweet in milliseconds since epoch. */
    time: number;
    /** Number of replies (public and private) to the tweet. */
    replies: number;
    /** Whether to render the tweet as right-to-left. */
    rtl: boolean;
    parent: string;

    images: string[] = [];

    /**
     * Returns a URL to this tweet on Twitter.
     */
    getUrl() {
        return `https://x.com/${this.username}/status/${this.id}`
    }

    /**
     * Returns a URL to the profile that posted this tweet on Twitter.
     */
    getUserUrl() {
        return `https://x.com/${this.username}`
    }
}

export interface TweetSet {
    rootTweet: string
    tweets: Tweet[]
    cursor: string
}

/**
 * Functions for parsing a response from the legacy Twitter API into Tweet and
 * TweetContext objects.
 */
export namespace TweetParser {
    export function parseCursor(response: APIResponse): string {
        let cursor = null
        for (let entry of response.timeline.instructions[0].addEntries.entries) {
            if (entry.content.operation && entry.content.operation.cursor) {
                if (entry.content.operation.cursor.cursorType === 'Bottom' ||
                    entry.content.operation.cursor.cursorType === 'ShowMoreThreads') {
                    cursor = entry.content.operation.cursor.value
                }
            }
        }
        return cursor
    }

    export function parseTweets(response: APIResponse): Tweet[] {
        let tweets = []
        let users = new Map<string, { handle: string, name: string, avatar: string }>()

        for (let userId in response.globalObjects.users) {
            let user = response.globalObjects.users[userId]
            users.set(userId, {
                handle: user.screen_name,
                name: user.name,
                avatar: user.profile_image_url_https
            })
        }

        for (let tweetId in response.globalObjects.tweets) {
            let entry = response.globalObjects.tweets[tweetId]
            let tweet = new Tweet()
            let user = users.get(entry.user_id_str)

            tweet.id = entry.id_str
            tweet.bodyText = entry.full_text
            tweet.bodyHtml = entry.full_text
            tweet.name = user.name
            tweet.username = user.handle
            tweet.avatar = user.avatar
            tweet.parent = entry.in_reply_to_status_id_str
            tweet.time = new Date(entry.created_at).getTime()
            tweet.replies = entry.reply_count

            tweets.push(tweet)
        }
        return tweets
    }

    export function parseResponse(rootTweet: string, response: APIResponse): TweetSet {
        const tweets = parseTweets(response)
        const cursor = parseCursor(response)
        return { tweets, cursor, rootTweet }
    }
}

/**
 * Functions for parsing a response from the Twitter GraphQL API (TweetDetail)
 * into Tweet and TweetContext objects.
 */
export namespace GraphQLTweetParser {
    function extractTweetFromResult(result: any): Tweet | null {
        if (!result) return null

        // Handle TweetWithVisibilityResults wrapper
        if (result.__typename === 'TweetWithVisibilityResults') {
            result = result.tweet
        }

        if (!result || !result.legacy) return null

        const legacy = result.legacy
        const userResult = result.core?.user_results?.result
        const userCore = userResult?.core
        const userLegacy = userResult?.legacy
        const userAvatar = userResult?.avatar

        const userName = userCore?.name || userLegacy?.name
        const userScreenName = userCore?.screen_name || userLegacy?.screen_name
        const userAvatarUrl = userAvatar?.image_url || userLegacy?.profile_image_url_https

        if (!userName && !userScreenName) return null

        const tweet = new Tweet()
        tweet.id = legacy.id_str || result.rest_id
        tweet.bodyText = legacy.full_text || ''
        tweet.bodyHtml = legacy.full_text || ''
        tweet.name = userName || ''
        tweet.username = userScreenName || ''
        tweet.avatar = userAvatarUrl || ''
        tweet.parent = legacy.in_reply_to_status_id_str || null
        tweet.time = new Date(legacy.created_at).getTime()
        tweet.replies = legacy.reply_count || 0

        // Extract images from extended_entities (preferred) or entities
        const mediaEntities = result.legacy.extended_entities?.media || result.legacy.entities?.media
        if (mediaEntities) {
            tweet.images = mediaEntities
                .filter((m: any) => m.type === 'photo')
                .map((m: any) => m.media_url_https)
        }

        return tweet
    }

    function parseEntries(entries: any[]): { tweets: Tweet[], cursor: string | null } {
        const tweets: Tweet[] = []
        let cursor: string | null = null

        for (const entry of entries) {
            const content = entry.content
            if (!content) continue

            if (content.__typename === 'TimelineTimelineItem') {
                // Single tweet entry (focal tweet, ancestors, etc.)
                const tweetResult = content.itemContent?.tweet_results?.result
                const tweet = extractTweetFromResult(tweetResult)
                if (tweet) tweets.push(tweet)
            } else if (content.__typename === 'TimelineTimelineModule') {
                // Conversation thread module (groups of replies)
                if (content.items) {
                    for (const item of content.items) {
                        const itemContent = item.item?.itemContent
                        if (!itemContent) continue

                        if (itemContent.tweet_results?.result) {
                            const tweet = extractTweetFromResult(itemContent.tweet_results.result)
                            if (tweet) tweets.push(tweet)
                        }
                    }
                }
            } else if (content.__typename === 'TimelineTimelineCursor') {
                if (content.cursorType === 'Bottom' || content.cursorType === 'ShowMoreThreads') {
                    cursor = content.value
                }
            }
        }

        return { tweets, cursor }
    }

    export function parseResponse(rootTweet: string, response: any): TweetSet {
        const allTweets: Tweet[] = []
        let cursor: string | null = null

        if (response?.errors) {
            console.error('[Treeverse] GraphQL errors:', response.errors)
        }

        const instructions = response?.data?.threaded_conversation_with_injections_v2?.instructions || []
        console.log('[Treeverse] Instructions count:', instructions.length,
            'rootTweet:', rootTweet,
            'response keys:', Object.keys(response || {}))

        for (const instruction of instructions) {
            if (instruction.type === 'TimelineAddEntries' && instruction.entries) {
                const result = parseEntries(instruction.entries)
                allTweets.push(...result.tweets)
                if (result.cursor) cursor = result.cursor
            } else if (instruction.type === 'TimelineReplaceEntry' && instruction.entry) {
                // Handle cursor replacement during pagination
                const content = instruction.entry.content
                if (content?.__typename === 'TimelineTimelineCursor') {
                    if (content.cursorType === 'Bottom' || content.cursorType === 'ShowMoreThreads') {
                        cursor = content.value
                    }
                }
            }
        }

        console.log('[Treeverse] Parsed tweets:', allTweets.length,
            'tweet IDs:', allTweets.map(t => t.id),
            'cursor:', cursor)

        return { tweets: allTweets, cursor, rootTweet }
    }
}
