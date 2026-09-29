# Futebol Manager

Football manager web/PWA inspirado na nostalgia dos clássicos managers de futebol, reconstruído com uma arquitetura moderna e orientada a dados.

## Stack

React + TypeScript + Vite, Tailwind CSS, Supabase, PWA, GitHub, Vitest e Playwright.

## Primeira experiência

Início → Treinador → Clube → Dashboard.

A carreira é persistida localmente neste estágio. Autenticação e salvamento em conta serão adicionados depois.

## Desenvolvimento

npm install
cp .env.example .env.local
npm run dev

Preencha VITE_SUPABASE_PUBLISHABLE_KEY em .env.local.

O GitHub é a fonte do código. O Supabase é a fonte dos dados do universo do jogo. O motor de simulação ficará separado da interface.
