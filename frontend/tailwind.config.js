/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                instagram: {
                    blue: '#0095f6',
                    purple: '#833ab4',
                    pink: '#fd1d1d',
                    orange: '#fcaf45',
                },
            },
        },
    },
    plugins: [],
}
