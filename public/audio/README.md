# Áudios da partida

Coloque os arquivos de áudio desta pasta com estes nomes exatos:

- `torcida-gol-nosso.mp3` — comemoração da torcida quando o nosso time marca.
- `torcida-gol-adversario.mp3` — vaia/reação da torcida quando o adversário marca.
- `apito-final.mp3` — apito de fim de jogo e intervalo.
- `apito-penalti.mp3` — apito para pênalti.
- `apito-expulsao.mp3` — apito para expulsão.
- `apito-lesao.mp3` — apito para lesão.

Os arquivos são carregados pelo jogo a partir de `/audio/...`.

Use arquivos MP3 pequenos, de preferência com poucos segundos de duração e volume normalizado. Os sons devem ser próprios, licenciados ou de uma biblioteca que permita uso no projeto.

Depois de copiar os arquivos para esta pasta, rode:

```bash
git add public/audio
git commit -m "assets: adicionar sons da partida"
git push
```

O código de áudio já está preparado em `src/engine/matchAudio.ts`.
