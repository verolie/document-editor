// Vercel entry point: every /api/* request is routed here (see vercel.json).
// The backend is compiled to backend/dist by `npm run vercel-build` before functions are bundled.
export { default } from '../backend/dist/app.js'
