import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const index = formData.get('index') as string;

    if (!file || !index) {
      return NextResponse.json({ success: false, error: 'Arquivo ou índice ausente' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'thinking');
    
    // Garante que a pasta existe
    await fs.mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${index}.jpg`;
    await fs.writeFile(path.join(uploadDir, fileName), buffer);

    console.log(`Imagem salva com sucesso: ${fileName}`);
    return NextResponse.json({ success: true, fileName });
  } catch (err) {
    console.error('Erro no upload:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
