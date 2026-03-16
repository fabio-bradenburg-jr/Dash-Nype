## Nype Dash

Dashboard multi-cliente com integrações de mídia e CRM, autenticação via Supabase e persistência pronta para produção no Supabase.

## Setup local

1. Crie seu projeto no Supabase.
2. Rode o SQL de [supabase_schema.sql](/Users/fabiojunior/Documents/Nype/supabase_schema.sql) no SQL Editor do Supabase.
3. Copie [.env.example](/Users/fabiojunior/Documents/Nype/.env.example) para `.env.local`.
4. Preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

5. Inicie o projeto:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Deploy

O caminho mais simples para colocar no ar é:

1. Subir o código na Vercel
2. Configurar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Garantir que o SQL de [supabase_schema.sql](/Users/fabiojunior/Documents/Nype/supabase_schema.sql) já foi executado no Supabase

Com isso, o dashboard já salva estado e clientes por usuário autenticado no Supabase.
