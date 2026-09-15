import React from 'react';
import Header from './Header';
import Footer from './Footer';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4">{children}</main>
      <Footer />
    </div>
  );
}
