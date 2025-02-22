import type { TemplateResult } from "lit";
import { render } from "lit";
import { property, state, query } from "lit/decorators.js";
import { when } from "lit/directives/when.js";
import { msg, localized } from "@lit/localize";
import type { SlDialog } from "@shoelace-style/shoelace";
import "broadcastchannel-polyfill";
import "tailwindcss/tailwind.css";

import type { ArchiveTab } from "./pages/archive";
import type { NotifyEvent, NavigateEvent } from "./utils/LiteElement";
import LiteElement, { html } from "./utils/LiteElement";
import APIRouter from "./utils/APIRouter";
import AuthService from "./utils/AuthService";
import type { LoggedInEvent } from "./utils/AuthService";
import type { ViewState } from "./utils/APIRouter";
import type { CurrentUser } from "./types/user";
import type { AuthStorageEventData } from "./utils/AuthService";
import type { Archive, ArchiveData } from "./utils/archives";
import theme from "./theme";
import { ROUTES, DASHBOARD_ROUTE } from "./routes";
import "./shoelace";
import "./components";
import "./pages";
import "./assets/fonts/Inter/inter.css";
import "./assets/fonts/Recursive/recursive.css";
import "./styles.css";

type DialogContent = {
  label?: TemplateResult | string;
  body?: TemplateResult | string;
  noHeader?: boolean;
};

type APIUser = {
  id: string;
  email: string;
  name: string;
  is_verified: boolean;
  is_superuser: boolean;
};

type UserSettings = {
  teamId: string;
};

/**
 * @event navigate
 * @event notify
 * @event need-login
 * @event logged-in
 * @event log-out
 * @event user-info-change
 */
@localized()
export class App extends LiteElement {
  static storageKey = "btrix.app";

  @property({ type: String })
  version?: string;

  private router: APIRouter = new APIRouter(ROUTES);
  authService: AuthService = new AuthService();

  @state()
  userInfo?: CurrentUser;

  @state()
  private viewState!: ViewState;

  @state()
  private globalDialogContent: DialogContent = {};

  @query("#globalDialog")
  private globalDialog!: SlDialog;

  @state()
  private isAppSettingsLoaded: boolean = false;

  @state()
  private isRegistrationEnabled?: boolean;

  @state()
  private teams?: ArchiveData[];

  // Store selected team ID for when navigating from
  // pages without associated team (e.g. user account)
  @state()
  private selectedTeamId?: string;

  async connectedCallback() {
    const authState = await AuthService.initSessionStorage();
    this.syncViewState();
    if (this.viewState.route === "archive") {
      this.selectedTeamId = this.viewState.params.id;
    }
    if (authState) {
      this.authService.saveLogin(authState);
      this.updateUserInfo();
    }
    super.connectedCallback();

    window.addEventListener("popstate", () => {
      this.syncViewState();
    });

    this.startSyncBrowserTabs();
    this.fetchAppSettings();
  }

  willUpdate(changedProperties: Map<string, any>) {
    if (
      changedProperties.get("viewState") &&
      this.viewState.route === "archive"
    ) {
      this.selectedTeamId = this.viewState.params.id;
    }
  }

  private syncViewState() {
    if (
      this.authService.authState &&
      (window.location.pathname === "/log-in" ||
        window.location.pathname === "/reset-password")
    ) {
      // Redirect to logged in home page
      this.viewState = this.router.match(DASHBOARD_ROUTE);
      window.history.replaceState(this.viewState, "", this.viewState.pathname);
    } else {
      this.viewState = this.router.match(
        `${window.location.pathname}${window.location.search}`
      );
    }
  }

  private async fetchAppSettings() {
    const settings = await this.getAppSettings();

    if (settings) {
      this.isRegistrationEnabled = settings.registrationEnabled;
    }

    this.isAppSettingsLoaded = true;
  }

  private async updateUserInfo() {
    try {
      const [userInfoResp, archivesResp] = await Promise.allSettled([
        this.getUserInfo().then((value) => {
          this.userInfo = {
            id: value.id,
            email: value.email,
            name: value.name,
            isVerified: value.is_verified,
            isAdmin: value.is_superuser,
          };
          const settings = this.getPersistedUserSettings(value.id);
          if (settings) {
            this.selectedTeamId = settings.teamId;
          }
          return value;
        }),
        // TODO see if we can add API endpoint to retrieve first archive
        this.getArchives(),
      ]);

      const userInfoSuccess = userInfoResp.status === "fulfilled";
      if (archivesResp.status === "fulfilled") {
        const { archives } = archivesResp.value;
        this.teams = archives;
        if (userInfoSuccess) {
          const userInfo = userInfoResp.value;
          if (archives.length && !userInfo?.is_superuser) {
            this.selectedTeamId = this.selectedTeamId || archives[0].id;

            if (archives.length === 1) {
              // Persist selected team ID since there's no
              // user selection event to persist
              this.persistUserSettings(userInfo.id, {
                teamId: this.selectedTeamId,
              });
            }
          }
        }
      } else {
        throw archivesResp.reason;
      }
    } catch (err: any) {
      if (err?.message === "Unauthorized") {
        console.debug(
          "Unauthorized with authState:",
          this.authService.authState
        );
        this.clearUser();
        this.navigate(ROUTES.login);
      }
    }
  }

  async getAppSettings(): Promise<{ registrationEnabled: boolean } | void> {
    const resp = await fetch("/api/settings", {
      headers: { "Content-Type": "application/json" },
    });

    if (resp.status === 200) {
      const body = await resp.json();

      return body;
    } else {
      console.debug(resp);
    }
  }

  navigate(newViewPath: string, state?: object) {
    let url;

    if (newViewPath.startsWith("http")) {
      url = new URL(newViewPath);
    } else {
      url = new URL(
        `${window.location.origin}/${newViewPath.replace(/^\//, "")}`
      );
    }

    // Remove hash from path for matching
    newViewPath = `${url.pathname}${url.search}`;

    if (newViewPath === "/log-in" && this.authService.authState) {
      // Redirect to logged in home page
      this.viewState = this.router.match(DASHBOARD_ROUTE);
    } else {
      this.viewState = this.router.match(newViewPath);
    }

    this.viewState.data = state;

    window.history.pushState(
      this.viewState,
      "",
      `${this.viewState.pathname.replace(url.search, "")}${url.hash}${
        url.search
      }`
    );
  }

  navLink(event: Event) {
    event.preventDefault();
    this.navigate((event.currentTarget as HTMLAnchorElement).href);
  }

  render() {
    return html`
      <style>
        ${theme}
      </style>

      <div class="min-w-screen min-h-screen flex flex-col">
        ${this.renderNavBar()} ${this.renderSubNavBar()}
        <main class="relative flex-auto flex">${this.renderPage()}</main>
        <div class="border-t border-neutral-100">${this.renderFooter()}</div>
      </div>

      <sl-dialog
        id="globalDialog"
        ?no-header=${this.globalDialogContent?.noHeader === true}
        label=${this.globalDialogContent?.label || msg("Message")}
        @sl-after-hide=${() => (this.globalDialogContent = {})}
        >${this.globalDialogContent?.body}</sl-dialog
      >
    `;
  }

  private renderNavBar() {
    const isAdmin = this.userInfo?.isAdmin;
    let homeHref = "/";
    if (!isAdmin && this.selectedTeamId) {
      homeHref = `/archives/${this.selectedTeamId}/crawls`;
    }

    return html`
      <div class="border-b">
        <nav
          class="max-w-screen-lg mx-auto pl-3 box-border h-12 flex items-center justify-between"
        >
          <div>
            <a href="${homeHref}" @click="${this.navLink}"
              ><h1 class="text-sm hover:text-neutral-400 font-medium">
                ${msg("Browsertrix Cloud")}
              </h1></a
            >
          </div>

          ${isAdmin
            ? html`
                <div
                  class="text-xs md:text-sm grid grid-flow-col gap-3 md:gap-5 items-center"
                >
                  <a
                    class="text-neutral-500 hover:text-neutral-400 font-medium"
                    href="/crawls"
                    @click=${this.navLink}
                    >${msg("Running Crawls")}</a
                  >
                  <div class="hidden md:block">${this.renderFindCrawl()}</div>
                </div>
              `
            : ""}

          <div class="grid grid-flow-col auto-cols-max gap-3 items-center">
            ${this.authService.authState
              ? html` ${this.renderTeams()}
                  <sl-dropdown placement="bottom-end">
                    <sl-icon-button
                      slot="trigger"
                      name="person-circle"
                      style="font-size: 1.5rem;"
                    ></sl-icon-button>

                    <sl-menu class="w-60 min-w-min max-w-full">
                      <div class="px-7 py-2">${this.renderMenuUserInfo()}</div>
                      <sl-divider></sl-divider>
                      <sl-menu-item
                        @click=${() => this.navigate(ROUTES.accountSettings)}
                      >
                        <sl-icon slot="prefix" name="gear"></sl-icon>
                        ${msg("Account Settings")}
                      </sl-menu-item>
                      ${this.userInfo?.isAdmin
                        ? html` <sl-menu-item
                            @click=${() => this.navigate(ROUTES.usersInvite)}
                          >
                            <sl-icon slot="prefix" name="person-plus"></sl-icon>
                            ${msg("Invite Users")}
                          </sl-menu-item>`
                        : ""}
                      <sl-divider></sl-divider>
                      <sl-menu-item @click="${this.onLogOut}">
                        <sl-icon slot="prefix" name="box-arrow-right"></sl-icon>
                        ${msg("Log Out")}
                      </sl-menu-item>
                    </sl-menu>
                  </sl-dropdown>`
              : html`
                  <a href="/log-in"> ${msg("Log In")} </a>
                  ${this.isRegistrationEnabled
                    ? html`
                        <sl-button
                          variant="text"
                          @click="${() => this.navigate("/sign-up")}"
                        >
                          ${msg("Sign up")}
                        </sl-button>
                      `
                    : html``}
                `}
          </div>
        </nav>
      </div>
    `;
  }

  private renderTeams() {
    if (!this.teams || this.teams.length < 2 || !this.userInfo) return;

    const selectedOption = this.selectedTeamId
      ? this.teams.find(({ id }) => id === this.selectedTeamId)
      : { id: "", name: msg("All Teams") };
    if (!selectedOption) {
      console.debug(
        `Could't find team with ID ${this.selectedTeamId}`,
        this.teams
      );
      return;
    }

    return html`
      <sl-dropdown placement="bottom-end">
        <sl-button slot="trigger" variant="text" size="small" caret
          >${selectedOption.name}</sl-button
        >
        <sl-menu
          @sl-select=${(e: CustomEvent) => {
            const { value } = e.detail.item;
            this.navigate(`/archives/${value}${value ? "/crawls" : ""}`);
            if (this.userInfo) {
              this.persistUserSettings(this.userInfo.id, { teamId: value });
            } else {
              console.debug("User info not set");
            }
          }}
        >
          ${when(
            this.userInfo.isAdmin,
            () => html`
              <sl-menu-item value="" ?checked=${!selectedOption.id}
                >${msg("All Teams")}</sl-menu-item
              >
              <sl-divider></sl-divider>
            `
          )}
          ${this.teams.map(
            (team) => html`
              <sl-menu-item
                value=${team.id}
                ?checked=${team.id === selectedOption.id}
                >${team.name}</sl-menu-item
              >
            `
          )}
        </sl-menu>
      </sl-dropdown>
    `;
  }

  private renderMenuUserInfo() {
    if (!this.userInfo) return;
    if (this.userInfo.isAdmin) {
      return html`
        <div class="mb-2">
          <sl-tag class="uppercase" variant="primary" size="small"
            >${msg("admin")}</sl-tag
          >
        </div>
        <div class="font-medium text-neutral-700">${this.userInfo?.name}</div>
        <div class="text-xs text-neutral-500 whitespace-nowrap">
          ${this.userInfo?.email}
        </div>
      `;
    }

    if (this.teams?.length === 1) {
      return html`
        <div class="font-medium text-neutral-700 my-1">
          ${this.teams![0].name}
        </div>
        <div class="text-neutral-500">${this.userInfo?.name}</div>
        <div class="text-xs text-neutral-500 whitespace-nowrap">
          ${this.userInfo?.email}
        </div>
      `;
    }

    return html`
      <div class="font-medium text-neutral-700">${this.userInfo?.name}</div>
      <div class="text-xs text-neutral-500 whitespace-nowrap">
        ${this.userInfo?.email}
      </div>
    `;
  }

  private renderFooter() {
    return html`
      <footer
        class="w-full max-w-screen-lg mx-auto p-1 md:p-3 box-border flex justify-end"
      >
        <div>
          <a
            class="text-neutral-400"
            href="https://github.com/webrecorder/browsertrix-cloud"
            target="_blank"
            rel="noopener"
          >
            ${this.version
              ? html`
                  <span class="inline-block align-middle text-mono text-xs">
                    ${this.version}
                  </span>
                `
              : ""}
            <sl-icon
              name="github"
              class="inline-block align-middle ml-1"
            ></sl-icon>
          </a>
        </div>
        <div>
          <!-- TODO re-enable when translations are added -->
          <!-- <btrix-locale-picker></btrix-locale-picker> -->
        </div>
      </footer>
    `;
  }

  private renderPage() {
    switch (this.viewState.route) {
      case "signUp": {
        if (!this.isAppSettingsLoaded) {
          return html`<div
            class="w-full md:bg-neutral-50 flex items-center justify-center"
          ></div>`;
        }
        if (this.isRegistrationEnabled) {
          return html`<btrix-sign-up
            class="w-full md:bg-neutral-50 flex items-center justify-center"
            @navigate="${this.onNavigateTo}"
            @logged-in="${this.onLoggedIn}"
            @log-out="${this.onLogOut}"
            .authState="${this.authService.authState}"
          ></btrix-sign-up>`;
        } else {
          return this.renderNotFoundPage();
        }
      }

      case "verify":
        return html`<btrix-verify
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          token="${this.viewState.params.token}"
          @navigate="${this.onNavigateTo}"
          @notify="${this.onNotify}"
          @log-out="${this.onLogOut}"
          @user-info-change="${this.onUserInfoChange}"
          .authState="${this.authService.authState}"
        ></btrix-verify>`;

      case "join":
        return html`<btrix-join
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          @navigate="${this.onNavigateTo}"
          @logged-in="${this.onLoggedIn}"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-join>`;

      case "acceptInvite":
        return html`<btrix-accept-invite
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          @navigate="${this.onNavigateTo}"
          @logged-in="${this.onLoggedIn}"
          @notify="${this.onNotify}"
          .authState="${this.authService.authState}"
          token="${this.viewState.params.token}"
          email="${this.viewState.params.email}"
        ></btrix-accept-invite>`;

      case "login":
      case "loginWithRedirect":
      case "forgotPassword":
        return html`<btrix-log-in
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .authState=${this.authService.authState}
          .viewState=${this.viewState}
          redirectUrl=${this.viewState.params.redirectUrl}
        ></btrix-log-in>`;

      case "resetPassword":
        return html`<btrix-reset-password
          class="w-full md:bg-neutral-50 flex items-center justify-center"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .authState=${this.authService.authState}
          .viewState=${this.viewState}
        ></btrix-reset-password>`;

      case "home":
        return html`<btrix-home
          class="w-full md:bg-neutral-50"
          @navigate=${this.onNavigateTo}
          @logged-in=${this.onLoggedIn}
          .authState=${this.authService.authState}
          .userInfo=${this.userInfo}
          .teamId=${this.selectedTeamId}
        ></btrix-home>`;

      case "archives":
        return html`<btrix-archives
          class="w-full md:bg-neutral-50"
          @navigate="${this.onNavigateTo}"
          @need-login="${this.onNeedLogin}"
          .authState="${this.authService.authState}"
          .userInfo="${this.userInfo}"
        ></btrix-archives>`;

      case "archive":
      case "archiveAddMember":
      case "archiveNewResourceTab":
      case "archiveCrawl":
      case "browserProfile":
      case "browser":
      case "crawlTemplate":
      case "crawlTemplateEdit":
        return html`<btrix-archive
          class="w-full"
          @navigate=${this.onNavigateTo}
          @need-login=${this.onNeedLogin}
          @notify="${this.onNotify}"
          .authState=${this.authService.authState}
          .userInfo=${this.userInfo}
          .viewStateData=${this.viewState.data}
          archiveId=${this.viewState.params.id}
          archiveTab=${this.viewState.params.tab as ArchiveTab}
          browserProfileId=${this.viewState.params.browserProfileId}
          browserId=${this.viewState.params.browserId}
          crawlConfigId=${this.viewState.params.crawlConfigId}
          crawlId=${this.viewState.params.crawlId}
          ?isAddingMember=${this.viewState.route === "archiveAddMember"}
          ?isNewResourceTab=${this.viewState.route === "archiveNewResourceTab"}
          ?isEditing=${"edit" in this.viewState.params}
        ></btrix-archive>`;

      case "accountSettings":
        return html`<btrix-account-settings
          class="w-full max-w-screen-lg mx-auto p-2 md:py-8 box-border"
          @navigate="${this.onNavigateTo}"
          @logged-in=${this.onLoggedIn}
          @need-login="${this.onNeedLogin}"
          .authState="${this.authService.authState}"
          .userInfo="${this.userInfo}"
        ></btrix-account-settings>`;

      case "usersInvite": {
        if (this.userInfo) {
          if (this.userInfo.isAdmin) {
            return html`<btrix-users-invite
              class="w-full max-w-screen-lg mx-auto p-2 md:py-8 box-border"
              @navigate="${this.onNavigateTo}"
              @need-login="${this.onNeedLogin}"
              .authState="${this.authService.authState}"
              .userInfo="${this.userInfo}"
            ></btrix-users-invite>`;
          } else {
            return this.renderNotFoundPage();
          }
        } else {
          return this.renderSpinner();
        }
      }

      case "crawls":
      case "crawl": {
        if (this.userInfo) {
          if (this.userInfo.isAdmin) {
            return html`<btrix-crawls
              class="w-full"
              @navigate=${this.onNavigateTo}
              @need-login=${this.onNeedLogin}
              @notify=${this.onNotify}
              .authState=${this.authService.authState}
              crawlId=${this.viewState.params.crawlId}
            ></btrix-crawls>`;
          } else {
            return this.renderNotFoundPage();
          }
        } else {
          return this.renderSpinner();
        }
      }

      default:
        return this.renderNotFoundPage();
    }
  }

  private renderSpinner() {
    return html`
      <div class="w-full flex items-center justify-center text-3xl">
        <sl-spinner></sl-spinner>
      </div>
    `;
  }

  private renderNotFoundPage() {
    return html`<btrix-not-found
      class="w-full md:bg-neutral-50 flex items-center justify-center"
    ></btrix-not-found>`;
  }

  private renderSubNavBar() {
    if (!this.userInfo || !this.selectedTeamId) return;

    return html`
      <div class="w-full max-w-screen-lg mx-auto px-3 box-border">
        <nav class="-ml-3 flex items-end overflow-x-auto">
          ${this.renderNavTab({ tabName: "crawls", label: msg("Crawls") })}
          ${this.renderNavTab({
            tabName: "crawl-templates",
            label: msg("Crawl Configs"),
          })}
          ${this.renderNavTab({
            tabName: "browser-profiles",
            label: msg("Browser Profiles"),
          })}
          ${this.renderNavTab({ tabName: "members", label: msg("Members") })}
        </nav>
      </div>

      <hr />
    `;
  }

  private renderNavTab({
    tabName,
    label,
  }: {
    tabName: ArchiveTab;
    label: string;
  }) {
    const isActive = this.viewState.params.tab === tabName;

    return html`
      <a
        id="${tabName}-tab"
        class="block flex-shrink-0 px-3 hover:bg-neutral-50 rounded-t transition-colors"
        href=${`/archives/${this.selectedTeamId}/${tabName}`}
        aria-selected=${isActive}
        @click=${this.navLink}
      >
        <div
          class="text-sm font-medium py-3 border-b-2 transition-colors ${isActive
            ? "border-primary text-primary"
            : "border-transparent text-neutral-500 hover:border-neutral-100 hover:text-neutral-900"}"
        >
          ${label}
        </div>
      </a>
    `;
  }

  private renderFindCrawl() {
    return html`
      <sl-dropdown
        @sl-after-show=${(e: any) => {
          e.target.querySelector("sl-input").focus();
        }}
        @sl-after-hide=${(e: any) => {
          e.target.querySelector("sl-input").value = "";
        }}
        hoist
      >
        <button
          slot="trigger"
          class="text-primary hover:text-indigo-400 font-medium"
        >
          ${msg("Jump to Crawl")}
        </button>

        <div class="p-2">
          <form
            @submit=${(e: any) => {
              e.preventDefault();
              const id = new FormData(e.target).get("crawlId");
              this.navigate(`/crawls/crawl/${id}`);
              e.target.closest("sl-dropdown").hide();
            }}
          >
            <div class="flex flex-wrap items-center">
              <div class="mr-2 w-90">
                <sl-input
                  size="small"
                  name="crawlId"
                  placeholder=${msg("Enter Crawl ID")}
                  required
                ></sl-input>
              </div>
              <div class="grow-0">
                <sl-button size="small" variant="neutral" type="submit">
                  <sl-icon slot="prefix" name="arrow-right-circle"></sl-icon>
                  ${msg("Go")}</sl-button
                >
              </div>
            </div>
          </form>
        </div>
      </sl-dropdown>
    `;
  }

  onLogOut(event: CustomEvent<{ redirect?: boolean } | null>) {
    const detail = event.detail || {};
    const redirect = detail.redirect !== false;

    if (this.userInfo) {
      this.unpersistUserSettings(this.userInfo.id);
    }
    this.clearUser();

    if (redirect) {
      this.navigate("/log-in");
    }
  }

  onLoggedIn(event: LoggedInEvent) {
    const { detail } = event;

    this.authService.saveLogin({
      username: detail.username,
      headers: detail.headers,
      tokenExpiresAt: detail.tokenExpiresAt,
    });

    if (!detail.api) {
      this.navigate(detail.redirectUrl || DASHBOARD_ROUTE);
    }

    if (detail.firstLogin) {
      this.onFirstLogin({ email: detail.username });
    }

    this.updateUserInfo();
  }

  onNeedLogin() {
    this.clearUser();
    this.navigate(ROUTES.login);
  }

  onNavigateTo(event: NavigateEvent) {
    event.stopPropagation();

    this.navigate(event.detail.url, event.detail.state);

    // Scroll to top of page
    window.scrollTo({ top: 0 });
  }

  onUserInfoChange(event: CustomEvent<Partial<CurrentUser>>) {
    // @ts-ignore
    this.userInfo = {
      ...this.userInfo,
      ...event.detail,
    };
  }

  /**
   * Show global toast alert
   */
  onNotify(event: NotifyEvent) {
    event.stopPropagation();

    const {
      title,
      message,
      variant = "primary",
      icon = "info-circle",
      duration = 5000,
    } = event.detail;

    const container = document.createElement("sl-alert");
    const alert = Object.assign(container, {
      variant,
      closable: true,
      duration: duration,
      style: [
        "--sl-panel-background-color: var(--sl-color-neutral-1000)",
        "--sl-color-neutral-700: var(--sl-color-neutral-0)",
        // "--sl-panel-border-width: 0px",
        "--sl-spacing-large: var(--sl-spacing-medium)",
      ].join(";"),
    });

    render(
      html`
        <sl-icon name="${icon}" slot="icon"></sl-icon>
        ${title ? html`<strong>${title}</strong>` : ""}
        ${message ? html`<div>${message}</div>` : ""}
      `,
      container
    );
    document.body.append(alert);
    alert.toast();
  }

  getUserInfo(): Promise<APIUser> {
    return this.apiFetch("/users/me", this.authService.authState!);
  }

  private clearUser() {
    this.authService.logout();
    this.authService = new AuthService();
    this.userInfo = undefined;
    this.selectedTeamId = undefined;
  }

  private getArchives(): Promise<{ archives: ArchiveData[] }> {
    return this.apiFetch("/archives", this.authService.authState!);
  }

  private showDialog(content: DialogContent) {
    this.globalDialogContent = content;
    this.globalDialog.show();
  }

  private closeDialog() {
    this.globalDialog.hide();
  }

  private onFirstLogin({ email }: { email: string }) {
    this.showDialog({
      label: "Welcome to Browsertrix Cloud",
      noHeader: true,
      body: html`
        <div class="grid gap-4 text-center">
          <p class="mt-8 text-xl font-medium">
            ${msg("Welcome to Browsertrix Cloud!")}
          </p>

          <p>
            ${msg(html`A confirmation email was sent to: <br />
              <strong>${email}</strong>.`)}
          </p>
          <p class="max-w-xs mx-auto">
            ${msg(
              "Click the link in your email to confirm your email address."
            )}
          </p>
        </div>

        <div class="mb-4 mt-8 text-center">
          <sl-button variant="primary" @click=${() => this.closeDialog()}
            >${msg("Got it, go to dashboard")}</sl-button
          >
        </div>
      `,
    });
  }

  private startSyncBrowserTabs() {
    AuthService.broadcastChannel.addEventListener(
      "message",
      ({ data }: { data: AuthStorageEventData }) => {
        if (data.name === "auth_storage") {
          if (data.value !== AuthService.storage.getItem()) {
            if (data.value) {
              this.authService.saveLogin(JSON.parse(data.value));
              this.updateUserInfo();
              this.syncViewState();
            } else {
              this.clearUser();
              this.navigate(ROUTES.login);
            }
          }
        }
      }
    );
  }

  private getPersistedUserSettings(userId: string): UserSettings | null {
    const value = window.localStorage.getItem(`${App.storageKey}.${userId}`);
    if (value) {
      return JSON.parse(value);
    }
    return null;
  }

  private persistUserSettings(userId: string, settings: UserSettings) {
    window.localStorage.setItem(
      `${App.storageKey}.${userId}`,
      JSON.stringify(settings)
    );
  }

  private unpersistUserSettings(userId: string) {
    window.localStorage.removeItem(`${App.storageKey}.${userId}`);
  }
}

customElements.define("browsertrix-app", App);
