interface AlertProps {
  variant?: 'error' | 'success' | 'info';
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<AlertProps['variant']>, string> = {
  error: 'bg-red-50 text-red-700 border-red-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  info: 'bg-blue-50 text-blue-900 border-blue-200',
};

export default function Alert({ variant = 'info', children }: AlertProps) {
  return (
    <div className={`border p-3 rounded text-sm ${VARIANT_CLASSES[variant]}`}>{children}</div>
  );
}
