const base = {
  width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
}
const Icon = (d) => (p) => (
  <svg {...base} {...p}>
    {d.map((path, i) => <path key={i} d={path} />)}
  </svg>
)

export const Mic = Icon(['M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z', 'M5 11a7 7 0 0 0 14 0', 'M12 18v3', 'M9 21h6'])
export const Phone = Icon(['M6.6 3h3l1.5 4-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z'])
export const PhoneOff = Icon(['M6.6 3h3l1.5 4-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z', 'm3 3 18 18'])
export const Grid = Icon(['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'])
export const List = Icon(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'])
export const Calendar = Icon(['M3 5.5A1.5 1.5 0 0 1 4.5 4h15A1.5 1.5 0 0 1 21 5.5v14A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5z', 'M3 9h18', 'M8 3v3', 'M16 3v3'])
export const Sliders = Icon(['M4 6h10', 'M18 6h2', 'M4 12h4', 'M12 12h8', 'M4 18h10', 'M18 18h2', 'M14 4v4', 'M8 10v4', 'M14 16v4'])
export const Card = Icon(['M2 6.5A1.5 1.5 0 0 1 3.5 5h17A1.5 1.5 0 0 1 22 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 17.5z', 'M2 10h20'])
export const Check = Icon(['m20 6-11 11-5-5'])
export const Arrow = Icon(['M5 12h14', 'M13 6l6 6-6 6'])
export const Back = Icon(['M19 12H5', 'M11 18l-6-6 6-6'])
export const Sparkle = Icon(['M12 3v4', 'M12 17v4', 'M3 12h4', 'M17 12h4', 'm5.6 5.6 2.8 2.8', 'm15.6 15.6 2.8 2.8', 'm18.4 5.6-2.8 2.8', 'm8.4 15.6-2.8 2.8'])
export const Clock = Icon(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'])
export const Logout = Icon(['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'])
export const Menu = Icon(['M3 6h18', 'M3 12h18', 'M3 18h18'])
export const Pause = Icon(['M9 5v14', 'M15 5v14'])
export const User = Icon(['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21a8 8 0 0 1 16 0'])
export const Play = Icon(['M6 4l14 8-14 8z'])
