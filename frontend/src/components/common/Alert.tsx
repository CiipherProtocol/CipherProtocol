interface AlertProps {
  variant?: 'error' | 'success' | 'info';
  children: React.ReactNode;
}

const VARIANT_CLASSES: Record<NonNullable<AlertProps['variant']>, string> = {
  error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
  success:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900',
  info: 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-900',
};

export default function Alert({ variant = 'info', children }: AlertProps) {
  return (
    <div className={`border p-3 rounded text-sm ${VARIANT_CLASSES[variant]}`}>{children}</div>
  );
}
