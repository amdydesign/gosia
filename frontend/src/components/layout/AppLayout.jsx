import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

export default function AppLayout({ children }) {
    return (
        <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
            {/* Sidebar for desktop */}
            <Sidebar />

            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0">
                <Header />

                <main className="flex-1 p-4 lg:p-8 overflow-x-hidden pb-24 lg:pb-8">
                    <div className="max-w-6xl mx-auto w-full">
                        {children}
                    </div>
                </main>
            </div>

            {/* Bottom Nav for mobile */}
            <MobileBottomNav />
        </div>
    );
}
