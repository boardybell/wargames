// The @app barrel. Later sections widen this; for now it exposes the shell
// root, the router seam, and the base-aware URL helper.
export { App } from './App'
export type { AppProps } from './App'
export {
  registerScreen,
  resolveScreen,
  FallbackFrame,
} from './router'
export type {
  ScreenId,
  BaseScreenId,
  OverlayId,
  RouterState,
  ScreenRegistry,
  ScreenComponent,
} from './router'
export { urlFor } from './urlFor'
