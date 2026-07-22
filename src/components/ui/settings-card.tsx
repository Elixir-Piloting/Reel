function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-elevated shadow-card rounded-lg p-4 space-y-3">
      <h2 className="text-heading font-medium">{title}</h2>
      {children}
    </div>
  );
}

export { SettingsCard }
