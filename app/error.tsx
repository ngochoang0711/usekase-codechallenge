'use client';

export default function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-8 text-center">
        <h1 className="text-lg font-semibold text-red-300">Something went wrong loading shows</h1>
        <p className="mt-2 text-sm opacity-70">{error.message || 'Unexpected error.'}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
