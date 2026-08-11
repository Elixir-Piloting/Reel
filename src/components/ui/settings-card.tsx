function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="clay-raised rounded-xl p-4 space-y-4">
      <h2 className="text-heading font-semibold">{title}</h2>
      {children}
    </div>
  );
}

export { SettingsCard }