export default function Loading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-32 bg-gray-200 rounded" />
        <div className="h-5 w-20 bg-gray-200 rounded" />
      </div>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="h-10 bg-gray-50 border-b border-gray-200" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center px-4 py-3 border-b border-gray-50">
            <div className="w-12 h-4 bg-gray-100 rounded mr-4" />
            <div className="flex-1 h-4 bg-gray-100 rounded" />
            <div className="w-16 h-4 bg-gray-100 rounded ml-4 hidden sm:block" />
            <div className="w-16 h-4 bg-gray-100 rounded ml-4 hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
