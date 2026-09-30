# Futebol Manager

Football manager web inspirado na nostalgia dos clássicos managers de futebol, reconstruído com uma arquitetura moderna e orientada a dados.

## Stack

React + TypeScript + Vite, Tailwind CSS, Supabase, GitHub e Vitest.

## Primeira experiência

Início → Treinador → Clube → Dashboard.

A carreira ainda usa localStorage durante a fase de desenvolvimento. Autenticação, saves por usuário e sincronização em nuvem estão em implementação.

## Desenvolvimento

npm install
cp .env.example .env.local
npm run dev

Preencha VITE_SUPABASE_PUBLISHABLE_KEY em .env.local.

O GitHub é a fonte do código. O Supabase fornece os dados persistentes do jogo. O motor de simulação fica separado da interface. Testes de interface e CI serão adicionados antes da publicação.
