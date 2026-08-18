"use client";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const iconCliente = new L.DivIcon({
  html: '<div style="background:#B8860B;width:12px;height:12px;border-radius:50%;border:2px solid white;"></div>',
  className: "",
  iconSize: [12, 12],
});
const iconUsuario = new L.DivIcon({
  html: '<div style="background:#C0392B;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 2px #C0392B55;"></div>',
  className: "",
  iconSize: [14, 14],
});

export default function LiveMap({ clientes, posiciones }: { clientes: any[]; posiciones: any[] }) {
  const center: [number, number] = clientes.length ? [clientes[0].lat, clientes[0].lng] : [-34.6037, -58.3816];
  return (
    <MapContainer center={center} zoom={12} style={{ height: 520, width: "100%", borderRadius: 8 }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      {clientes.map((c) => (
        <div key={c.id}>
          <Marker position={[c.lat, c.lng]} icon={iconCliente}>
            <Popup>
              <b>{c.nombre}</b><br />{c.direccion}
            </Popup>
          </Marker>
          <Circle center={[c.lat, c.lng]} radius={c.radio_geofence_m || 150} pathOptions={{ color: "#B8860B", fillOpacity: 0.05 }} />
        </div>
      ))}
      {posiciones.map((p) => (
        <Marker key={p.usuario_id} position={[p.lat, p.lng]} icon={iconUsuario}>
          <Popup>
            <b>{p.nombre}</b><br />Última posición: {new Date(p.ts).toLocaleTimeString("es-AR")}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
