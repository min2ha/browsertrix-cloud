export const ROUTES = {
  home: "/",
  join: "/join/:token?email",
  signUp: "/sign-up",
  acceptInvite: "/invite/accept/:token?email",
  verify: "/verify?token",
  login: "/log-in",
  loginWithRedirect: "/log-in?redirectUrl",
  forgotPassword: "/log-in/forgot-password",
  resetPassword: "/reset-password?token",
  accountSettings: "/account/settings",
  archives: "/archives",
  archive: "/archives/:id/:tab",
  archiveNewResourceTab: "/archives/:id/:tab/new",
  archiveAddMember: "/archives/:id/:tab/add-member",
  archiveCrawl: "/archives/:id/:tab/crawl/:crawlId",
  browserProfile: "/archives/:id/:tab/profile/:browserProfileId",
  browser:
    "/archives/:id/:tab/profile/browser/:browserId?name&description&profileId&navigateUrl",
  crawlTemplate: "/archives/:id/:tab/config/:crawlConfigId",
  crawlTemplateEdit: "/archives/:id/:tab/config/:crawlConfigId?edit",
  users: "/users",
  usersInvite: "/users/invite",
  crawls: "/crawls",
  crawl: "/crawls/crawl/:crawlId",
} as const;

export const DASHBOARD_ROUTE = ROUTES.home;
