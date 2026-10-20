"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="wrap" id="content">
      <h1>That request did not finish.</h1>
      <p>The desk hit an unexpected error. Try the page again.</p>
      <button type="button" onClick={() => reset()}>Try again</button>
    </main>
  );
}
