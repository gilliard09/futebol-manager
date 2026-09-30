# Futebol Manager

Football manager web inspirado na nostalgia dos clássicos managers de futebol, reconstruído com uma arquitetura moderna e orientada a dados.

## Stack

React + TypeScript + Vite, Tailwind CSS, Supabase, GitHub e Vitest.

## Primeira experiência

Início → Treinador → Clube → Dashboard.

A carreira mantém parte do estado local para a fase de desenvolvimento, mas o estado de gestão/comercial já é preparado para autenticação e RLS por usuário. O cliente tenta criar uma sessão anônima do Supabase para que cada navegador tenha um proprietário isolado; no projeto Supabase, habilite Anonymous Sign-Ins antes de publicar.

## Desenvolvimento

npm install
cp .env.example .env.local
npm run dev

Preencha VITE_SUPABASE_PUBLISHABLE_KEY em .env.local.

O GitHub é a fonte do código. O Supabase fornece os dados persistentes do jogo. O motor de simulação fica separado da interface. O projeto já inclui manifest e service worker PWA.

Antes de publicar, aplique as migrations do diretório `supabase/migrations` no projeto Supabase correto e rode `npm test` e `npm run build`.
