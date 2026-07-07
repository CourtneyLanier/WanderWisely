// Minimal typing for @svg-maps/usa (ships untyped).
declare module '@svg-maps/usa' {
  export interface SvgMapLocation {
    id: string // lowercase state abbreviation, e.g. 'tx' (plus 'dc')
    name: string
    path: string
  }
  export interface SvgMap {
    label: string
    viewBox: string
    locations: SvgMapLocation[]
  }
  const usa: SvgMap
  export default usa
}
