import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
  secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 disabled:text-gray-400',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 disabled:text-gray-300',
};

export default function Button({
  variant = 'primary',
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`px-4 py-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
