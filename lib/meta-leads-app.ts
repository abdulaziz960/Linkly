/**
 * The Meta app used only for Lead Ads ("Linkly Lead Ads"): its own app, so its App Review (leads_retrieval and the
 * page permissions) never touches the WhatsApp app and its approvals. Both ids are public (they appear in the login
 * URL); the app secret is META_LEADS_APP_SECRET and lives in the deployment secrets only.
 */
export const metaLeadsAppId = process.env.META_LEADS_APP_ID?.trim() || "2511029202710396";
// Its Facebook Login for Business configuration (General, user access token: pages_show_list,
// pages_read_engagement, leads_retrieval, pages_manage_metadata).
export const metaLeadsConfigId = process.env.META_LEADS_CONFIG_ID?.trim() || "1447933677541578";
