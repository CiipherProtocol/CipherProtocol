import Button from '../common/Button';

interface SubmitButtonProps {
  loading: boolean;
  disabled: boolean;
  text: string;
}

export default function SubmitButton({ loading, disabled, text }: SubmitButtonProps) {
  return (
    <Button type="submit" disabled={disabled || loading} className="w-full">
      {loading ? 'Submitting...' : text}
    </Button>
  );
}
