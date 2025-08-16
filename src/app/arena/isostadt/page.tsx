import dynamic from "next/dynamic";

// Load the client-only shell (contains hooks and the client canvas) without SSR
const IsostadtShell = dynamic(() => import("@/components/arena/isostadt/IsostadtShell"), { ssr: false });

export default function ArenaIsostadtPage() {
  return (
    <main className="p-0 m-0 max-w-none">
      <IsostadtShell />
    </main>
  );
}
