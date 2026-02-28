import { GraphQLTweetParser, TweetSet } from './tweet_parser'
import { ContentProxy } from './proxy'
import { RateLimiter } from './rate_limiter'

// Default features for TweetDetail GraphQL endpoint.
// Captured from live Twitter web client. May need periodic updates.
const DEFAULT_FEATURES = {
  "rweb_video_screen_enabled": false,
  "profile_label_improvements_pcf_label_in_post_enabled": true,
  "responsive_web_profile_redirect_enabled": false,
  "rweb_tipjar_consumption_enabled": false,
  "verified_phone_label_enabled": false,
  "creator_subscriptions_tweet_preview_api_enabled": true,
  "responsive_web_graphql_timeline_navigation_enabled": true,
  "responsive_web_graphql_skip_user_profile_image_extensions_enabled": false,
  "premium_content_api_read_enabled": false,
  "communities_web_enable_tweet_community_results_fetch": true,
  "c9s_tweet_anatomy_moderator_badge_enabled": true,
  "responsive_web_grok_analyze_button_fetch_trends_enabled": false,
  "responsive_web_grok_analyze_post_followups_enabled": true,
  "responsive_web_jetfuel_frame": true,
  "responsive_web_grok_share_attachment_enabled": true,
  "responsive_web_grok_annotations_enabled": true,
  "articles_preview_enabled": true,
  "responsive_web_edit_tweet_api_enabled": true,
  "graphql_is_translatable_rweb_tweet_is_translatable_enabled": true,
  "view_counts_everywhere_api_enabled": true,
  "longform_notetweets_consumption_enabled": true,
  "responsive_web_twitter_article_tweet_consumption_enabled": true,
  "tweet_awards_web_tipping_enabled": false,
  "responsive_web_grok_show_grok_translated_post": false,
  "responsive_web_grok_analysis_button_from_backend": true,
  "post_ctas_fetch_enabled": false,
  "freedom_of_speech_not_reach_fetch_enabled": true,
  "standardized_nudges_misinfo": true,
  "tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled": true,
  "longform_notetweets_rich_text_read_enabled": true,
  "longform_notetweets_inline_media_enabled": true,
  "responsive_web_grok_image_annotation_enabled": true,
  "responsive_web_grok_imagine_annotation_enabled": true,
  "responsive_web_grok_community_note_auto_translation_is_enabled": false,
  "responsive_web_enhance_cards_enabled": false,
}

const DEFAULT_FIELD_TOGGLES = {
  "withArticleRichContentState": true,
  "withArticlePlainText": false,
  "withGrokAnalyze": false,
  "withDisallowedReplyControls": false,
}

// Fallback queryId for TweetDetail (captured from live Twitter web client).
// The runtime sniffing mechanism will override this with the actual queryId.
const FALLBACK_QUERY_ID = 'YCNdW_ZytXfV9YR3cJK9kw'

function buildGraphQLUrl(tweetId: string, cursor: string | null, queryId?: string, featuresJson?: string): string {
  const qid = queryId || FALLBACK_QUERY_ID

  const variables: any = {
    focalTweetId: tweetId,
    with_rux_injections: false,
    rankingMode: 'Relevance',
    includePromotedContent: true,
    withCommunity: true,
    withQuickPromoteEligibilityTweetFields: true,
    withBirdwatchNotes: true,
    withVoice: true,
  }

  if (cursor) {
    variables.cursor = cursor
  }

  const features = featuresJson || JSON.stringify(DEFAULT_FEATURES)

  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: features,
    fieldToggles: JSON.stringify(DEFAULT_FIELD_TOGGLES),
  })

  return `${location.origin}/i/api/graphql/${qid}/TweetDetail?${params.toString()}`
}

/**
 * Interfaces with Twitter GraphQL API server.
 */
export class TweetServer {
  constructor(private proxy: ContentProxy, private rateLimiter: RateLimiter) { }

  /**
   * Requests the TweetContext for a given tweet and returns a promise.
   * All requests go through the RateLimiter queue.
   */
  async requestTweets(tweetId: string, cursor: string | null): Promise<TweetSet> {
    return this.rateLimiter.enqueue(async () => {
      const graphqlInfo = this.proxy.getGraphQLInfo()
      const url = buildGraphQLUrl(
        tweetId,
        cursor,
        graphqlInfo?.queryId,
        graphqlInfo?.features
      )

      const response = await this.proxy.delegatedFetch(url)
      return GraphQLTweetParser.parseResponse(tweetId, response as any)
    })
  }
}
