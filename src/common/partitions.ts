const WEXOND_PARTITION = 'persist:view'

/**
 * The UI (app.html) keeps a session of its own: sharing the tabs' partition let
 * Chromium place it in a renderer spawned for a tab, where Node is never
 * bootstrapped, leaving `require` undefined and the window blank.
 */
const WEXOND_UI_PARTITION = 'persist:wexond-ui'

const FLOWR_PARTITION = 'persist:flowr'

export {
    WEXOND_PARTITION,
    WEXOND_UI_PARTITION,
    FLOWR_PARTITION,
}
