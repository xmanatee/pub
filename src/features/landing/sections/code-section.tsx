import { Terminal } from "lucide-react";
import { TerminalPreview } from "~/components/terminal-preview";

export function CodeSection() {
  return (
    <section className="py-24">
      <div className="px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            From command to live
          </h2>
          <p className="text-muted-foreground text-lg">Create a page, then stream live updates.</p>
        </div>

        <div className="max-w-2xl mx-auto">
          <TerminalPreview
            className="shadow-2xl shadow-primary/5"
            headerRight={
              <div className="ml-auto flex items-center gap-1.5 text-white/40">
                <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="text-xs font-mono">terminal</span>
              </div>
            }
          >
            <div className="p-6 font-mono text-sm leading-relaxed space-y-6">
              <div>
                <div className="text-white/40 text-xs mb-1"># Create page</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> pub create index.html
                </div>
                <div className="text-emerald-400 mt-0.5">Created: https://pub.blue/p/k8f2m9</div>
              </div>

              <div>
                <div className="text-white/40 text-xs mb-1"># Set slug + title</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> pub create --slug my-demo --title "Demo
                  Page" page.html
                </div>
                <div className="text-emerald-400 mt-0.5">Created: https://pub.blue/p/my-demo</div>
              </div>

              <div>
                <div className="text-white/40 text-xs mb-1"># Push live canvas</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> pub write -c canvas -f ./visual.html
                </div>
                <div className="text-emerald-400 mt-0.5">Delivered: canvas update confirmed</div>
              </div>
            </div>
          </TerminalPreview>
        </div>
      </div>
    </section>
  );
}
