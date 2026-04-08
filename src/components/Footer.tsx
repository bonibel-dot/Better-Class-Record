import React from 'react';
import { BookOpen } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="mt-12 py-8 text-center text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-center gap-2 mb-3">
        <div className="bg-indigo-50 dark:bg-indigo-900/30 p-1.5 rounded-lg">
          <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <span className="font-bold text-gray-900 dark:text-white text-lg">ClassRecord+</span>
      </div>
      <div className="space-y-1">
        <p className="font-medium text-gray-900 dark:text-white">© 2026 JEMEEL B. MENDIOLA</p>
        <p className="text-xs tracking-wider text-gray-400 dark:text-gray-500">ALL RIGHTS RESERVED</p>
      </div>
    </footer>
  );
}
