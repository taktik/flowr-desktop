const WEXOND_PARTITION = 'persist:view'

/**
 * The UI keeps its own session: sharing the tabs' partition let Chromium run
 * app.html in a node-less process, leaving `require` undefined and a blank window.
 */
const WEXOND_UI_PARTITION = 'persist:wexond-ui'

const FLOWR_PARTITION = 'persist:flowr'

export {
    WEXOND_PARTITION,
    WEXOND_UI_PARTITION,
    FLOWR_PARTITION,
}
