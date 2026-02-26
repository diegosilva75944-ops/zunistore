-- CreateTable
CREATE TABLE "MlToken" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MlToken_pkey" PRIMARY KEY ("id")
);
