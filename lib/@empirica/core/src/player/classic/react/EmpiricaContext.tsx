import React from "react";
import { Consent, ConsentProps } from "../../react/Consent";
import { Finished } from "../../react/Finished";
import { Loading } from "../../react/Loading";
import { NoGames } from "../../react/NoGames";
import { PlayerCreate, PlayerCreateProps } from "../../react/PlayerCreate";
import {
  useConsent,
  useGlobal,
  usePartConnected,
  usePlayerID,
  useTajribaConnected,
} from "../../react/hooks";
import { Lobby as DefaultLobby } from "./Lobby";
import { Steps, StepsFunc } from "./Steps";
import { useGame, usePlayer, usePlayers, useRound, useStage } from "./hooks";

export interface EmpiricaContextProps {
  children: React.ReactNode;
  noGames?: React.ElementType;
  consent?: React.ElementType<ConsentProps>;
  playerCreate?: React.ElementType<PlayerCreateProps>;
  lobby?: React.ElementType;
  introSteps?: React.ElementType[] | StepsFunc;
  exitSteps?: React.ElementType[] | StepsFunc;
  finished?: React.ElementType;
  loading?: React.ElementType;
  connecting?: React.ElementType;

  // An unmanaged game will render the children whether the game, round or stage
  // are available or not. It is up to the developer to handle the presence of
  // the game, round and stage. Other parts are still managed: the consent, the
  // player creation, the intro and exit steps.
  // This is not recommended for most games.
  // This is useful for experiments that implement custom assignment and games
  // that want to persist render state between rounds or stages. E.g.: keep a
  // video chat up between stages.
  unmanagedGame?: boolean;

  // Unmanaged assignement will render the children as soon as the player is
  // connected. It is up to the developer to handle everything after the player
  // is connected: intro steps, lobby, game, round, stage and exit steps.
  unmanagedAssignment?: boolean;

  // Disable the consent screen. It is up to the developer to handle the consent
  // screen.
  disableConsent?: boolean;

  // Disable the NoGames screen. It is up to the developer to handle the NoGames
  // condition.
  disableNoGames?: boolean;

  // Disable capturing URL params (?what=hello&some=thing) onto the Player under
  // the `urlParams` key.
  disableURLParamsCapture?: boolean;
}

export function EmpiricaContext({
  noGames: NoGamesComp = NoGames,
  consent: ConsentComp = Consent,
  playerCreate: PlayerCreateForm = PlayerCreate,
  introSteps = [],
  lobby = DefaultLobby,
  exitSteps = [],
  finished = Finished,
  loading: LoadingComp = Loading,
  connecting: ConnectingComp = Loading,
  unmanagedGame = false,
  unmanagedAssignment = false,
  disableConsent = false,
  disableNoGames = false,
  disableURLParamsCapture = false,
  children,
}: EmpiricaContextProps) {
  const tajribaConnected = useTajribaConnected();
  const participantConnected = usePartConnected();
  const globals = useGlobal();
  const player = usePlayer();
  const game = useGame();
  const [connecting, hasPlayer, onPlayerID] = usePlayerID();
  const [consented, onConsent] = useConsent();

  if (!tajribaConnected || connecting) {
    return <ConnectingComp />;
  }

  if (player && player.get("ended")) {
    return <Exit exitSteps={exitSteps} finished={finished} />;
  }

  if (
    !globals ||
    (hasPlayer && (!participantConnected || !player || game === undefined))
  ) {
    return <LoadingComp />;
  }

  if (
    !disableNoGames &&
    !globals.get("experimentOpen") &&
    (!hasPlayer || !player?.get("gameID"))
  ) {
    return <NoGamesComp />;
  }

  if (!disableConsent && !consented) {
    return <ConsentComp onConsent={onConsent!} />;
  }

  if (!hasPlayer) {
    return (
      <PlayerCreateForm onPlayerID={onPlayerID!} connecting={connecting} />
    );
  }

  if (!player || (!unmanagedGame && !game)) {
    return <LoadingComp />;
  }

  // TODO Put in a useEffect, this is dirty.
  if (!disableURLParamsCapture && !player.get("urlParams")) {
    const urlParams = new URLSearchParams(window.location.search);
    player.set("urlParams", Object.fromEntries(urlParams.entries()));
  }

  if (unmanagedAssignment) {
    return <>{children}</>;
  }

  if (game && game.hasEnded) {
    if (!player.get("ended")) {
      return <LoadingComp />;
    }

    return <Exit exitSteps={exitSteps} finished={finished} />;
  }

  return (
    <Steps progressKey="intro" doneKey="introDone" steps={introSteps}>
      <EmpiricaInnerContext
        exitSteps={exitSteps}
        lobby={lobby}
        finished={finished}
        loading={LoadingComp}
        unmanagedGame={unmanagedGame}
      >
        {children}
      </EmpiricaInnerContext>
    </Steps>
  );
}

interface EmpiricaInnerContextProps {
  children: React.ReactNode;
  lobby: React.ElementType;
  exitSteps: React.ElementType[] | StepsFunc;
  finished: React.ElementType;
  loading: React.ElementType;
  unmanagedGame: boolean;
}

function EmpiricaInnerContext({
  children,
  lobby: Lobby,
  finished,
  exitSteps,
  loading: LoadingComp,
  unmanagedGame = false,
}: EmpiricaInnerContextProps) {
  const player = usePlayer();
  const game = useGame();
  const allReady = useAllReady();

  if (!game) {
    if (unmanagedGame) {
      return <>{children}</>;
    } else {
      return <LoadingComp />;
    }
  }

  if (!Boolean(game.get("status"))) {
    return <Lobby />;
  }

  if (game.hasEnded) {
    if (!player?.get("ended")) {
      return <LoadingComp />;
    }

    return <Exit exitSteps={exitSteps} finished={finished} />;
  }

  if (unmanagedGame || allReady) {
    return <>{children}</>;
  }

  return <LoadingComp />;
}

function Exit({
  exitSteps,
  finished: Finished,
}: {
  exitSteps: React.ElementType[] | StepsFunc;
  finished: React.ElementType;
}) {
  return (
    <Steps progressKey="exitStep" doneKey="exitStepDone" steps={exitSteps}>
      <Finished />
    </Steps>
  );
}

function useAllReady() {
  const player = usePlayer();
  const players = usePlayers();
  const game = useGame();
  const stage = useStage();
  const round = useRound();

  if (
    !player ||
    !players ||
    !stage ||
    !round ||
    !game ||
    !player.game ||
    !player.round ||
    !player.stage
  ) {
    return false;
  }

  const treatment = game.get("treatment") as { playerCount: number };

  const playerCount = treatment!["playerCount"];

  if (players.length < playerCount) {
    return false;
  }

  for (const p of players) {
    if (!p.game || !p.round || !p.stage) {
      return false;
    }
  }

  return true;
}
