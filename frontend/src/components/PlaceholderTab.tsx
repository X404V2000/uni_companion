import { Icon, type IconName } from "./Icon";

function PlaceholderTab({ label, icon, notify }: { label: string; icon: IconName; notify: (msg: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-[var(--color-surface)] text-[var(--color-teal)]">
        <Icon name={icon} className="h-8 w-8" />
      </div>
      <h2 className="font-display text-xl font-extrabold text-[var(--color-fg)]">{label}</h2>
      <p className="mt-2 max-w-[240px] text-sm leading-relaxed text-[var(--color-fg-subtle)]">
        Nothing here yet.
      </p>
    </div>
  );
}

export default PlaceholderTab;
