'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { api } from '@/lib/api';

interface Product {
  id: number; name: string; description: string;
  price: number; currency: string; active: number;
}

const EMPTY = { name: '', description: '', price: '' };

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<Product[]>('/api/products').then(setProducts).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api('/api/products', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, description: form.description, price: Number(form.price) || 0 }),
      });
      setForm(EMPTY);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function toggleActive(p: Product) {
    await api(`/api/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) });
    load();
  }

  async function editPrice(p: Product) {
    const price = prompt(`Nuevo precio de "${p.name}" (S/):`, String(p.price));
    if (price === null) return;
    await api(`/api/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ price: Number(price) || 0 }) });
    load();
  }

  async function remove(p: Product) {
    if (!confirm(`¿Eliminar "${p.name}" del catálogo?`)) return;
    await api(`/api/products/${p.id}`, { method: 'DELETE' });
    load();
  }

  return (
    <Shell>
      <div className="mx-auto max-w-4xl p-8">
        <h1 className="text-2xl font-bold">Catálogo</h1>
        <p className="mt-1 text-sm text-slate-500">
          El Empleado IA usa este catálogo para responder preguntas y recomendar productos.
        </p>

        <form onSubmit={addProduct} className="mt-6 grid grid-cols-[1fr_2fr_120px_auto] gap-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Producto"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
          />
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Descripción (tallas, colores, detalles…)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
          />
          <input
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            placeholder="Precio S/"
            type="number"
            step="0.1"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-wa-dark focus:outline-none"
          />
          <button
            disabled={!form.name}
            className="rounded-lg bg-wa-dark px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Agregar
          </button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {products.length === 0 && <p className="p-6 text-sm text-slate-400">Catálogo vacío. Agrega tu primer producto.</p>}
          {products.map((p) => (
            <div key={p.id} className={`flex items-center justify-between border-b border-slate-100 px-5 py-4 last:border-0 ${!p.active ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <div className="font-medium">{p.name} {!p.active && <span className="text-xs text-slate-400">(inactivo)</span>}</div>
                {p.description && <p className="mt-0.5 truncate text-xs text-slate-500">{p.description}</p>}
              </div>
              <div className="ml-4 flex shrink-0 items-center gap-3">
                <span className="font-semibold">{p.currency} {p.price.toFixed(2)}</span>
                <button onClick={() => editPrice(p)} className="text-xs text-slate-500 hover:text-slate-800">Precio</button>
                <button onClick={() => toggleActive(p)} className="text-xs text-slate-500 hover:text-slate-800">
                  {p.active ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => remove(p)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
