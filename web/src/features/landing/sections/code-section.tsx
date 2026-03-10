import { Terminal } from "lucide-react";
import { TerminalPreview } from "~/components/terminal-preview";

export function CodeSection() {
  return (
    <section className="py-24">
      <div className="px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tighter mb-4">
            From terminal to interface
          </h2>
          <p className="text-muted-foreground text-lg">
            Create apps, push updates, go live — all from the command line.
          </p>
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
                <div className="text-white/40 text-xs mb-1"># Create an app</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> pub create --slug my-app dashboard.html
                </div>
                <div className="text-emerald-400 mt-0.5">Created: https://pub.blue/p/my-app</div>
              </div>

              <div>
                <div className="text-white/40 text-xs mb-1"># Start a live session</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> pub start --agent-name "my-agent"
                </div>
                <div className="text-emerald-400 mt-0.5">
                  Agent online. Waiting for connection...
                </div>
              </div>

              <div>
                <div className="text-white/40 text-xs mb-1"># Push a real-time interface</div>
                <div className="text-white/70">
                  <span className="text-primary">$</span> pub write -c canvas -f ./interface.html
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
