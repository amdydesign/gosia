/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#c084a0',
                    light: '#e8c5d5',
                    dark: '#9a6b81',
                },
                secondary: {
                    DEFAULT: '#a78bba',
                    light: '#d4c4e3',
                    dark: '#8a6fa0',
                },
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
