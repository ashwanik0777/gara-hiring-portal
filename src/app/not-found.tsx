import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center min-h-[60vh]">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary mb-6">
        <FileQuestion className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-bold tracking-tight text-foreground mb-6">Page Not Found</h2>
      <Link href="/">
        <Button>Return to Home</Button>
      </Link>
    </div>
  );
}
