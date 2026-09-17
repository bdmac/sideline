export function PlayerIdentity({
  name,
  number,
}: {
  name: string;
  number?: number;
}) {
  return (
    <span className="player-identity">
      <span className="player-identity-name">{name}</span>
      {number !== undefined && (
        <span className="player-identity-number"> #{number}</span>
      )}
    </span>
  );
}
