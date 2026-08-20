export default function Loading() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="h-9 w-32 animate-pulse rounded bg-white/10" />
      <div className="mt-6 flex flex-col gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg border border-white/10 bg-white/5" />
        ))}
      </div>
    </main>
  );
}
