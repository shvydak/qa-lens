export default function ThemePanel() {
  return (
    <div className="p-6">
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gray-800/60 flex items-center justify-center mb-4 text-gray-600">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 3v16" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 3a8 8 0 010 16z" fill="currentColor" />
          </svg>
        </div>
        <p className="text-sm text-gray-300 font-medium">Appearance</p>
        <p className="text-xs text-gray-600 mt-1.5 max-w-xs">
          Light theme and accent color customization are on the roadmap. QA Lens currently runs in
          dark mode only.
        </p>
      </div>
    </div>
  )
}
