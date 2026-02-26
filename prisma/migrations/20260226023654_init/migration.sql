-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "internalCode" SERIAL NOT NULL,
    "mlItemId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "promoPrice" DECIMAL(10,2),
    "offPercent" INTEGER,
    "description" TEXT NOT NULL,
    "images" JSONB NOT NULL,
    "rating" DOUBLE PRECISION,
    "reviewsCount" INTEGER,
    "affiliateUrl" TEXT NOT NULL,
    "isPromo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_internalCode_key" ON "Product"("internalCode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_mlItemId_key" ON "Product"("mlItemId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");
