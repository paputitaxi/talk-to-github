import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Position {
  x: number;
  y: number;
}

interface Snake {
  id: string;
  segments: Position[];
  color: string;
  isPlayer: boolean;
  direction: number; // in radians
  speed: number;
  isDead: boolean;
}

interface Food {
  x: number;
  y: number;
  color: string;
  size: number;
}

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 1500;
const SEGMENT_SIZE = 8;
const FOOD_COUNT = 200;
const AI_SNAKE_COUNT = 5;

const SlitherGame = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameRunning, setGameRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [mousePos, setMousePos] = useState<Position>({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 });
  const [camera, setCamera] = useState<Position>({ x: 0, y: 0 });
  
  const snakesRef = useRef<Snake[]>([]);
  const foodRef = useRef<Food[]>([]);
  const animationFrameRef = useRef<number>();

  const generateFood = useCallback(() => {
    const foods: Food[] = [];
    for (let i = 0; i < FOOD_COUNT; i++) {
      foods.push({
        x: Math.random() * WORLD_WIDTH,
        y: Math.random() * WORLD_HEIGHT,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        size: 3 + Math.random() * 3
      });
    }
    return foods;
  }, []);

  const createSnake = useCallback((x: number, y: number, isPlayer: boolean, id: string): Snake => {
    const segments: Position[] = [];
    for (let i = 0; i < 5; i++) {
      segments.push({ x: x - i * SEGMENT_SIZE, y });
    }
    
    return {
      id,
      segments,
      color: isPlayer ? 'hsl(var(--primary))' : `hsl(${Math.random() * 360}, 70%, 50%)`,
      isPlayer,
      direction: Math.random() * Math.PI * 2,
      speed: 2,
      isDead: false
    };
  }, []);

  const initializeGame = useCallback(() => {
    const snakes: Snake[] = [];
    
    // Create player snake
    snakes.push(createSnake(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, true, 'player'));
    
    // Create AI snakes
    for (let i = 0; i < AI_SNAKE_COUNT; i++) {
      snakes.push(createSnake(
        Math.random() * WORLD_WIDTH,
        Math.random() * WORLD_HEIGHT,
        false,
        `ai_${i}`
      ));
    }
    
    snakesRef.current = snakes;
    foodRef.current = generateFood();
    setScore(0);
    setGameOver(false);
  }, [createSnake, generateFood]);

  const updateAI = useCallback((snake: Snake) => {
    if (snake.isPlayer || snake.isDead) return;

    // Simple AI: move towards nearest food
    const head = snake.segments[0];
    let nearestFood: Food | null = null;
    let minDistance = Infinity;

    foodRef.current.forEach(food => {
      const distance = Math.sqrt((food.x - head.x) ** 2 + (food.y - head.y) ** 2);
      if (distance < minDistance) {
        minDistance = distance;
        nearestFood = food;
      }
    });

    if (nearestFood) {
      const targetAngle = Math.atan2(nearestFood.y - head.y, nearestFood.x - head.x);
      const angleDiff = targetAngle - snake.direction;
      
      // Normalize angle difference
      let normalizedDiff = angleDiff;
      while (normalizedDiff > Math.PI) normalizedDiff -= 2 * Math.PI;
      while (normalizedDiff < -Math.PI) normalizedDiff += 2 * Math.PI;
      
      // Turn towards target
      const turnSpeed = 0.05;
      if (Math.abs(normalizedDiff) > turnSpeed) {
        snake.direction += Math.sign(normalizedDiff) * turnSpeed;
      } else {
        snake.direction = targetAngle;
      }
    }
  }, []);

  const updateSnake = useCallback((snake: Snake) => {
    if (snake.isDead) return;

    updateAI(snake);

    // Update player direction based on mouse
    if (snake.isPlayer) {
      const head = snake.segments[0];
      const mouseWorldX = mousePos.x + camera.x - CANVAS_WIDTH / 2;
      const mouseWorldY = mousePos.y + camera.y - CANVAS_HEIGHT / 2;
      snake.direction = Math.atan2(mouseWorldY - head.y, mouseWorldX - head.x);
    }

    // Move snake
    const head = { ...snake.segments[0] };
    head.x += Math.cos(snake.direction) * snake.speed;
    head.y += Math.sin(snake.direction) * snake.speed;

    // Keep in bounds
    head.x = Math.max(SEGMENT_SIZE, Math.min(WORLD_WIDTH - SEGMENT_SIZE, head.x));
    head.y = Math.max(SEGMENT_SIZE, Math.min(WORLD_HEIGHT - SEGMENT_SIZE, head.y));

    snake.segments.unshift(head);

    // Check food collision
    let ate = false;
    foodRef.current = foodRef.current.filter(food => {
      const distance = Math.sqrt((food.x - head.x) ** 2 + (food.y - head.y) ** 2);
      if (distance < SEGMENT_SIZE + food.size) {
        ate = true;
        if (snake.isPlayer) {
          setScore(prev => prev + 1);
        }
        // Add new food
        foodRef.current.push({
          x: Math.random() * WORLD_WIDTH,
          y: Math.random() * WORLD_HEIGHT,
          color: `hsl(${Math.random() * 360}, 70%, 60%)`,
          size: 3 + Math.random() * 3
        });
        return false;
      }
      return true;
    });

    if (!ate) {
      snake.segments.pop();
    }

    // Check collision with other snakes
    snakesRef.current.forEach(otherSnake => {
      if (otherSnake.id === snake.id || otherSnake.isDead) return;
      
      otherSnake.segments.forEach((segment, index) => {
        if (index === 0 && otherSnake.id !== snake.id) return; // Don't check head-to-head
        
        const distance = Math.sqrt((segment.x - head.x) ** 2 + (segment.y - head.y) ** 2);
        if (distance < SEGMENT_SIZE) {
          snake.isDead = true;
          if (snake.isPlayer) {
            setGameOver(true);
            setGameRunning(false);
          }
        }
      });
    });
  }, [mousePos, camera, updateAI]);

  const gameLoop = useCallback(() => {
    if (!gameRunning || gameOver) return;

    snakesRef.current.forEach(updateSnake);

    // Update camera to follow player
    const playerSnake = snakesRef.current.find(s => s.isPlayer);
    if (playerSnake && !playerSnake.isDead) {
      const head = playerSnake.segments[0];
      setCamera({
        x: head.x - CANVAS_WIDTH / 2,
        y: head.y - CANVAS_HEIGHT / 2
      });
    }

    // Remove dead AI snakes and replace them
    snakesRef.current = snakesRef.current.filter(snake => {
      if (!snake.isPlayer && snake.isDead) {
        // Replace with new AI snake
        snakesRef.current.push(createSnake(
          Math.random() * WORLD_WIDTH,
          Math.random() * WORLD_HEIGHT,
          false,
          `ai_${Date.now()}`
        ));
        return false;
      }
      return true;
    });

    animationFrameRef.current = requestAnimationFrame(gameLoop);
  }, [gameRunning, gameOver, updateSnake, createSnake]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = 'hsl(var(--background))';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Draw world border
    ctx.strokeStyle = 'hsl(var(--border))';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Draw food
    foodRef.current.forEach(food => {
      if (
        food.x + camera.x > -50 &&
        food.x + camera.x < CANVAS_WIDTH + 50 &&
        food.y + camera.y > -50 &&
        food.y + camera.y < CANVAS_HEIGHT + 50
      ) {
        ctx.fillStyle = food.color;
        ctx.beginPath();
        ctx.arc(food.x, food.y, food.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Draw snakes
    snakesRef.current.forEach(snake => {
      if (snake.isDead) return;
      
      snake.segments.forEach((segment, index) => {
        if (
          segment.x + camera.x > -50 &&
          segment.x + camera.x < CANVAS_WIDTH + 50 &&
          segment.y + camera.y > -50 &&
          segment.y + camera.y < CANVAS_HEIGHT + 50
        ) {
          ctx.fillStyle = snake.color;
          ctx.beginPath();
          const size = index === 0 ? SEGMENT_SIZE + 2 : SEGMENT_SIZE;
          ctx.arc(segment.x, segment.y, size, 0, Math.PI * 2);
          ctx.fill();
          
          if (index === 0) {
            // Draw eyes
            ctx.fillStyle = 'white';
            const eyeOffset = 3;
            const eyeX1 = segment.x + Math.cos(snake.direction - 0.5) * eyeOffset;
            const eyeY1 = segment.y + Math.sin(snake.direction - 0.5) * eyeOffset;
            const eyeX2 = segment.x + Math.cos(snake.direction + 0.5) * eyeOffset;
            const eyeY2 = segment.y + Math.sin(snake.direction + 0.5) * eyeOffset;
            
            ctx.beginPath();
            ctx.arc(eyeX1, eyeY1, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(eyeX2, eyeY2, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      });
    });

    ctx.restore();

    requestAnimationFrame(draw);
  }, [camera]);

  const startGame = () => {
    initializeGame();
    setGameRunning(true);
    animationFrameRef.current = requestAnimationFrame(gameLoop);
  };

  const resetGame = () => {
    setGameRunning(false);
    setGameOver(false);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      <Card className="p-6">
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold mb-2">Slither Game</h1>
          <p className="text-lg">Score: {score}</p>
        </div>
        
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="border border-border rounded cursor-none"
            onMouseMove={handleMouseMove}
          />
          
          {!gameRunning && !gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded">
              <div className="text-center">
                <p className="text-lg mb-4">Move your mouse to control the snake!</p>
                <Button onClick={startGame}>Start Game</Button>
              </div>
            </div>
          )}
          
          {gameOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded">
              <div className="text-center">
                <p className="text-xl mb-2">Game Over!</p>
                <p className="text-lg mb-4">Final Score: {score}</p>
                <Button onClick={resetGame}>Play Again</Button>
              </div>
            </div>
          )}
        </div>
        
        <div className="mt-4 text-center text-sm text-muted-foreground">
          <p>Move your mouse to control your snake</p>
          <p>Eat food to grow and avoid other snakes!</p>
        </div>
      </Card>
    </div>
  );
};

export default SlitherGame;
