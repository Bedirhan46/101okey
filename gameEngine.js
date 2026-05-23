/**
 * 101 Okey Game Engine
 * Decoupled logic class representing the game state and rules.
 * Easily portable to a backend server.
 */

class OkeyGameEngine {
    constructor() {
        this.colors = ['red', 'black', 'blue', 'yellow'];
        this.resetGame();
    }

    resetGame() {
        this.deck = [];
        this.players = [
            { id: 0, name: 'Siz', hand: [], openedMelds: [], isBot: false, score: 0, openDouble: false, doubleMelds: [] },
            { id: 1, name: 'Bot Mehmet', hand: [], openedMelds: [], isBot: true, score: 0, openDouble: false, doubleMelds: [] },
            { id: 2, name: 'Bot Ayşe', hand: [], openedMelds: [], isBot: true, score: 0, openDouble: false, doubleMelds: [] },
            { id: 3, name: 'Bot Can', hand: [], openedMelds: [], isBot: true, score: 0, openDouble: false, doubleMelds: [] }
        ];
        this.tableMelds = []; // Global list of opened melds: { id, playerId, type: 'run'|'group', tiles: [] }
        this.discardPiles = [[], [], [], []]; // Discard piles for players 0, 1, 2, 3
        this.indicatorTile = null; // The shown tile
        this.okeyTile = null;      // The tile that is Okey (wildcard)
        this.turn = 0;             // Whose turn it is (0-3)
        this.gamePhase = 'deal';   // 'deal', 'draw', 'play', 'ended'
        this.drawPile = [];        // Remaining tiles to draw
        this.winnerId = null;
        this.hasDrawnThisTurn = false;
        this.meldIdCounter = 0;
    }

    /**
 
            this.hasDrawnThisTurn = false;
            this.drewFromDiscard = false;
            this.gamePhase = 'draw';
            return { success: false, reason: "Yandan atılan taşı aldıysanız elinizi açmak zorundasınız!" };
        }

        const player = this.players[playerId];
        const tileIndex = player.hand.findIndex(t => t.id === tileId);
        if (tileIndex === -1) return { success: false, reason: "Taş elinizde bulunamadı!" };

        const discardedTile = player.hand.splice(tileIndex, 1)[0];
        this.discardPiles[playerId].push(discardedTile);

        // Check win condition (0 tiles left in hand)
        if (player.hand.length === 0) {
            this.endGame(playerId, discardedTile);
            return { success: true, win: true, tile: discardedTile };
        }

        // Pass turn
        this.turn = (this.turn + 1) % 4;
        this.hasDrawnThisTurn = false;
        this.drewFromDiscard = false;
        this.gamePhase = 'draw';

        return { success: true, win: false, tile: discardedTile };
    }

    /**
     * Auto-sort runs (Seriler)
     * Groups colors, sorts by number, identifies valid runs (e.g. 5-6-7, 12-13-1), groups sets,
     * and reorganizes the player's rack.
     */
    autoSortRuns(hand) {
        // Clone hand
        const tempHand = [...hand];
        
        // Separate wildcards (Okey tiles) to place them easily
        const wildcards = tempHand.filter(t => t.isWildcard);
        const normalTiles = tempHand.filter(t => !t.isWildcard);

        // Group by color
        const byColor = { red: [], black: [], blue: [], yellow: [] };