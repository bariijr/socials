import { Link } from 'react-router';
import { Plane, FileCheck, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export type LandingMode = 'charter' | 'permit';

interface LandingHeroProps {
  onSelect: (mode: LandingMode) => void;
}

export default function LandingHero({ onSelect }: LandingHeroProps) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <Plane className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">VIQ</span>
          </div>
          <Link to="/trips" className="text-sm text-muted-foreground hover:text-foreground">
            INTERNAL LOGIN
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-20">
        <div className="mb-14 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground">
            <Plane className="h-3.5 w-3.5 text-primary" />
            PRIVATE AVIATION TRIP MANAGEMENT
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            WHERE ARE YOU FLYING?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            TELL US WHAT YOU NEED AND WE'LL HANDLE PERMITS, GROUND HANDLING, AND ROUTE PLANNING — NO REGISTRATION REQUIRED.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <button type="button" onClick={() => onSelect('charter')} className="text-left">
            <Card className="h-full transition-all hover:border-primary hover:shadow-lg">
              <CardContent className="flex h-full flex-col p-8">
                <Plane className="h-8 w-8 text-primary" />
                <h2 className="mt-4 text-xl font-bold tracking-tight">CHARTER / PRIVATE FLIGHT</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">
                  Full trip request — aircraft, route, crew & passengers. We'll analyze the route and arrange every permit and service along the way.
                </p>
                <div className="mt-6 flex items-center gap-1 text-sm font-semibold text-primary">
                  START REQUEST <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </button>

          <button type="button" onClick={() => onSelect('permit')} className="text-left">
            <Card className="h-full transition-all hover:border-primary hover:shadow-lg">
              <CardContent className="flex h-full flex-col p-8">
                <FileCheck className="h-8 w-8 text-primary" />
                <h2 className="mt-4 text-xl font-bold tracking-tight">PERMIT & GROUND HANDLING ONLY</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">
                  Already have crew and pax sorted? Just request overflight/landing permits and ground handling for a specific route.
                </p>
                <div className="mt-6 flex items-center gap-1 text-sm font-semibold text-primary">
                  START REQUEST <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </button>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        VIQ — PRIVATE AVIATION TRIP MANAGEMENT
      </footer>
    </div>
  );
}
