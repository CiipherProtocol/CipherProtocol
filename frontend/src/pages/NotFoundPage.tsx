import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="py-20 text-center">
      <h1 className="mb-4 text-4xl font-bold">404</h1>
      <p className="mb-8 text-gray-600">Page not found</p>
      <Link to="/" className="text-blue-600 hover:underline">
        Back home
      </Link>
    </div>
  );
}
