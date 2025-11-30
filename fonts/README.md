# Шрифты DejaVu Sans

Эта папка содержит шрифты DejaVu Sans для поддержки кириллицы в PDF.

## Установка шрифтов

### Ручная загрузка (рекомендуется)

1. Скачайте архив со шрифтами:
   - Официальный сайт: https://dejavu-fonts.github.io/Download.html
   - Или напрямую: https://sourceforge.net/projects/dejavu/files/dejavu/2.37/dejavu-fonts-ttf-2.37.zip/download

2. Распакуйте архив и найдите папку `ttf/`

3. Скопируйте следующие 4 файла в папку `fonts/` этого проекта:
   - `DejaVuSans.ttf`
   - `DejaVuSans-Bold.ttf`
   - `DejaVuSans-Oblique.ttf`
   - `DejaVuSans-BoldOblique.ttf`

### Альтернативный способ (через браузер)

Откройте каждую ссылку в браузере и сохраните файл в папку `fonts/`:
- https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans.ttf
- https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-Bold.ttf
- https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-Oblique.ttf
- https://github.com/dejavu-fonts/dejavu-fonts/raw/master/ttf/DejaVuSans-BoldOblique.ttf

## Необходимые файлы

- `DejaVuSans.ttf` - обычный шрифт
- `DejaVuSans-Bold.ttf` - жирный шрифт
- `DejaVuSans-Oblique.ttf` - курсив
- `DejaVuSans-BoldOblique.ttf` - жирный курсив

## Примечание

Шрифты должны быть добавлены в Git репозиторий для работы на Vercel.
После добавления файлов выполните:
```bash
git add fonts/*.ttf
git commit -m "Add DejaVu Sans fonts for Cyrillic support"
git push
```

